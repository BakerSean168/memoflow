import type { PrismaClient } from '@memoflow/database';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { bearer } from 'better-auth/plugins';
import { deviceAuthorization } from 'better-auth/plugins/device-authorization';
import type { RequestHandler } from 'express';
import type { IncomingHttpHeaders } from 'node:http';
import type { CloudAuthEmailDelivery } from './email-delivery.js';
import { verifyCloudPassword } from './password-compatibility.js';

const DESKTOP_DEVICE_CLIENT_ID = 'memoflow-desktop';

export interface CloudPrincipal {
  readonly identityId: string;
  readonly sessionId: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

export interface CloudSessionCapability {
  resolvePrincipal(headers: Headers): Promise<CloudPrincipal | null>;
  resolveNodePrincipal(headers: IncomingHttpHeaders): Promise<CloudPrincipal | null>;
}

interface CloudUserProvisioner {
  provision(input: {
    readonly identityId: string;
    readonly email: string;
    readonly name: string;
    readonly emailVerified: boolean;
  }): Promise<void>;
}

interface CloudAuthOptions {
  readonly database: PrismaClient;
  readonly secret: string;
  readonly baseUrl: string;
  readonly deviceVerificationUrl: string;
  readonly trustedOrigins: readonly string[];
  readonly github?: {
    readonly clientId: string;
    readonly clientSecret: string;
  };
  readonly userProvisioner: CloudUserProvisioner;
  readonly emailDelivery: CloudAuthEmailDelivery;
  readonly closureChecker?: (identityId: string) => Promise<boolean>;
  readonly rateLimit?: {
    readonly enabled?: boolean;
    readonly customRules?: Readonly<
      Record<string, { readonly window: number; readonly max: number }>
    >;
  };
}

interface CloudAuth extends CloudSessionCapability {
  readonly handler: (request: Request) => Promise<Response>;
  readonly expressHandler: RequestHandler;
  resolvePrincipal(headers: Headers): Promise<CloudPrincipal | null>;
  resolveNodePrincipal(headers: IncomingHttpHeaders): Promise<CloudPrincipal | null>;
  cleanupExpiredDeviceCodes(now?: Date): Promise<number>;
  revokeAllSessions(identityId: string): Promise<{ revokedSessions: number }>;
}

interface CloudAuthDependencies {
  /** Opaque test/internal adapter override; Better Auth types stay implementation-private. */
  readonly database?: unknown;
}

export function createCloudAuth(
  options: CloudAuthOptions,
  dependencies: CloudAuthDependencies = {},
): CloudAuth {
  async function isClosureBlocked(identityId: string): Promise<boolean> {
    if (options.closureChecker && (await options.closureChecker(identityId))) {
      return true;
    }
    if (typeof options.database.cloudAuthUser?.findUnique === 'function') {
      const user = await options.database.cloudAuthUser.findUnique({
        where: { id: identityId },
        select: { disabledAt: true },
      });
      if (user && user.disabledAt !== null) {
        return true;
      }
    }
    return false;
  }

  const databaseOverride = dependencies.database as BetterAuthOptions['database'] | undefined;
  const auth = betterAuth({
    appName: 'MemoFlow',
    baseURL: options.baseUrl,
    secret: options.secret,
    trustedOrigins: [...options.trustedOrigins],
    database:
      databaseOverride ??
      prismaAdapter(options.database, {
        provider: 'postgresql',
        transaction: true,
      }),
    advanced: {
      ipAddress: {
        // MemoFlow is deployed behind reverse proxies (Nginx/Caddy). Better Auth
        // uses the resolved client address for rate limiting and session metadata.
        ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'],
      },
      database: {
        generateId: ({ model }) => (model === 'user' ? IdentityId.generate().toString() : false),
      },
    },
    rateLimit: options.rateLimit,
    user: { modelName: 'cloudAuthUser' },
    session: { modelName: 'cloudAuthSession' },
    account: { modelName: 'cloudAuthProviderAccount' },
    verification: { modelName: 'cloudAuthVerification' },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      password: {
        verify: verifyCloudPassword,
      },
      sendResetPassword: async ({ user, url }) => {
        await options.emailDelivery.send({
          kind: 'password-reset',
          email: user.email,
          url,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await options.emailDelivery.send({
          kind: 'email-verification',
          email: user.email,
          url,
        });
      },
    },
    socialProviders: options.github
      ? {
          github: {
            clientId: options.github.clientId,
            clientSecret: options.github.clientSecret,
          },
        }
      : undefined,
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              await options.userProvisioner.provision({
                identityId: user.id,
                email: user.email,
                name: user.name,
                emailVerified: user.emailVerified,
              });
            } catch (error) {
              await options.database.cloudAuthUser.delete({ where: { id: user.id } });
              throw error;
            }
          },
        },
        update: {
          after: async (user) => {
            await options.userProvisioner.provision({
              identityId: user.id,
              email: user.email,
              name: user.name,
              emailVerified: user.emailVerified,
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            if (await isClosureBlocked(session.userId)) {
              throw new Error('Account closure in progress or completed');
            }
          },
        },
      },
    },
    plugins: [
      bearer(),
      deviceAuthorization({
        expiresIn: '10m',
        interval: '5s',
        verificationUri: options.deviceVerificationUrl,
        validateClient: (clientId) => clientId === DESKTOP_DEVICE_CLIENT_ID,
        schema: {
          deviceCode: { modelName: 'cloudAuthDeviceCode' },
        },
      }),
    ],
  });

  const rawExpressHandler = toNodeHandler(auth);
  const rawHandler = auth.handler;

  const resolvePrincipal = async (headers: Headers): Promise<CloudPrincipal | null> => {
    const resolved = await auth.api.getSession({ headers });
    if (!resolved) return null;
    if (await isClosureBlocked(resolved.user.id)) return null;

    return {
      identityId: resolved.user.id,
      sessionId: resolved.session.id,
      email: resolved.user.email,
      emailVerified: resolved.user.emailVerified,
    };
  };

  const resolveNodePrincipal = async (
    headers: IncomingHttpHeaders,
  ): Promise<CloudPrincipal | null> => {
    const resolved = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!resolved) return null;
    if (await isClosureBlocked(resolved.user.id)) return null;

    return {
      identityId: resolved.user.id,
      sessionId: resolved.session.id,
      email: resolved.user.email,
      emailVerified: resolved.user.emailVerified,
    };
  };

  const checkRequestAccess = async (headers: Headers, body?: unknown): Promise<Response | null> => {
    // 1. Check existing session in request headers (e.g. get-session, refresh, or session-authenticated calls)
    const resolved = await auth.api.getSession({ headers }).catch(() => null);
    let sessionUserId: string | null = resolved?.user?.id ?? null;
    if (!sessionUserId) {
      // Bearer-token sessions (not cookie): resolve via Authorization header
      const authz = headers.get('authorization') ?? headers.get('Authorization');
      const bearer = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length).trim() : null;
      if (bearer && options.database.cloudAuthSession) {
        const session = await options.database.cloudAuthSession
          .findFirst({ where: { token: bearer }, select: { userId: true } })
          .catch(() => null);
        if (session?.userId) sessionUserId = session.userId;
      }
    }
    if (sessionUserId && (await isClosureBlocked(sessionUserId))) {
      return new Response(
        JSON.stringify({
          error: 'Account closure in progress or completed',
          code: 'ACCOUNT_CLOSED',
        }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      );
    }

    // 2. Check email/identifier in the body for email authentication calls.
    if (body && typeof body === 'object') {
      const email = 'email' in body && typeof body.email === 'string' ? body.email : undefined;
      const identifier =
        'identifier' in body && typeof body.identifier === 'string' ? body.identifier : undefined;
      const targetEmail = email || identifier;
      if (targetEmail) {
        if (options.database.cloudAuthUser) {
          const user = await options.database.cloudAuthUser.findFirst({
            where: { email: targetEmail.toLowerCase() },
            select: { id: true },
          });
          if (user && (await isClosureBlocked(user.id))) {
            return new Response(
              JSON.stringify({
                error: 'Account closure in progress or completed',
                code: 'ACCOUNT_CLOSED',
              }),
              { status: 403, headers: { 'content-type': 'application/json' } },
            );
          }
        }
      }
    }

    return null;
  };

  const readExpressBody = async (req: any): Promise<unknown> => {
    if (req.body !== undefined && req.body !== null) return req.body;
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') return undefined;
    if (req.readableEnded || req.destroyed) return undefined;

    return new Promise((resolve) => {
      let data = '';
      const onData = (chunk: Buffer | string) => {
        data += chunk;
      };
      const onEnd = () => {
        cleanup();
        try {
          const parsed = JSON.parse(data);
          req.body = parsed;
          resolve(parsed);
        } catch {
          resolve(undefined);
        }
      };
      const onError = () => {
        cleanup();
        resolve(undefined);
      };
      const cleanup = () => {
        if (typeof req.off === 'function') {
          req.off('data', onData);
          req.off('end', onEnd);
          req.off('error', onError);
        } else if (typeof req.removeListener === 'function') {
          req.removeListener('data', onData);
          req.removeListener('end', onEnd);
          req.removeListener('error', onError);
        }
      };
      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onError);
    });
  };

  const expressHandler: RequestHandler = async (req, res, next) => {
    const headers = fromNodeHeaders(req.headers);
    const body = await readExpressBody(req);
    const accessResponse = await checkRequestAccess(headers, body);
    if (accessResponse) {
      res.status(accessResponse.status);
      for (const [key, value] of accessResponse.headers.entries()) {
        res.setHeader(key, value);
      }
      const text = await accessResponse.text();
      res.send(text);
      return;
    }
    return rawExpressHandler(req, res);
  };

  const handler = async (request: Request): Promise<Response> => {
    let body: unknown = undefined;
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
      body = await request
        .clone()
        .json()
        .catch(() => undefined);
    }
    const accessResponse = await checkRequestAccess(request.headers, body);
    if (accessResponse) {
      return accessResponse;
    }
    return rawHandler(request);
  };

  return {
    handler,
    expressHandler,
    resolvePrincipal,
    resolveNodePrincipal,
    async cleanupExpiredDeviceCodes(now = new Date()) {
      const result = await options.database.cloudAuthDeviceCode.deleteMany({
        where: { expiresAt: { lt: now } },
      });
      return result.count;
    },
    async revokeAllSessions(identityId) {
      const sessionResult = await options.database.cloudAuthSession.deleteMany({
        where: { userId: identityId },
      });
      await options.database.cloudAuthDeviceCode.deleteMany({
        where: { userId: identityId },
      });
      return { revokedSessions: sessionResult.count };
    },
  };
}
