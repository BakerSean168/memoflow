import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  sessionMiddleware,
} from 'better-auth/api';
import { getOAuthProviderApi, getOAuthProviderState } from '@better-auth/oauth-provider';
import {
  DEFAULT_EXTERNAL_AGENT_RATE_LIMITS,
  type GatewayAuditEvent,
} from '@memoflow/agent-gateway';
import type { Prisma } from '@memoflow/database';
import {
  CONNECTION_CLAIM,
  CONNECTION_LIFETIME_MS,
  createExternalAgentProvider,
  externalAgentOAuthScopes,
  externalAgentScopes,
  type CimdFetchTransport,
  type ExternalAgentOAuthOptions,
} from './external-agent-provider';
import type { createOAuthStore } from './oauth-store';

const ClaimsSchema = z.object({
  sub: z.string().min(1),
  client_id: z.string().min(1),
  scope: z.string(),
  [CONNECTION_CLAIM]: z.uuid(),
});
const ConsentBodySchema = z.object({ oauth_query: z.string().min(1).max(16384) });

export interface VerifiedOAuthPrincipal {
  readonly identityId: string;
  readonly credentialId: string;
  readonly credentialType: 'oauth';
  readonly scopes: readonly string[];
  readonly clientId: string;
  /** Consent scopes current at authentication time; revalidated again in the write transaction. */
  readonly consentScopes: readonly string[];
}

/** Product grant policy around the provider's code/PKCE/token implementation. */
export function createExternalAgentOAuth(
  store: ReturnType<typeof createOAuthStore>,
  options: ExternalAgentOAuthOptions,
  closureBlocked: (identityId: string) => Promise<boolean>,
  cimdFetch?: CimdFetchTransport,
  resolveIdentity?: (request: Request) => Promise<string | null>,
) {
  const db = store.db;
  const requests = new AsyncLocalStorage<{
    acceptingConsent: boolean;
    refresh?: { userId: string; clientId: string };
    revokedConnection?: string;
    revokedOwner?: { userId: string; clientId: string };
    codeConnections?: string[];
    consentGrant?: {
      userId: string;
      clientId: string;
      scopes: string[];
      credentialId?: string;
    };
  }>();
  const allowWrite = options.writeEnabled === true;
  const allowedOAuthScopes = externalAgentOAuthScopes(allowWrite);
  const allowedScopes = externalAgentScopes(allowWrite);
  const invalidGrant = () => new APIError('BAD_REQUEST', { error: 'invalid_grant' });
  function audit(
    event: Omit<GatewayAuditEvent, 'version' | 'durationMs' | 'requestId' | 'traceId'>,
    requestId = 'unavailable',
  ) {
    try {
      options.audit?.({
        ...event,
        version: '1',
        requestId,
        traceId: 'unavailable',
        durationMs: 0,
      });
    } catch {
      /* Audit collection never changes an OAuth response. */
    }
  }

  async function activeUser(userId: string) {
    return !(await closureBlocked(userId)) && (await options.accountIsActive(userId));
  }

  async function currentGrant(id: string, userId: string, clientId?: string) {
    const connection = await db.externalAgentConnection.findUnique({ where: { id } });
    if (
      !connection ||
      connection.userId !== userId ||
      (clientId !== undefined && connection.clientId !== clientId) ||
      connection.resource !== options.resource ||
      connection.revokedAt ||
      connection.expiresAt.getTime() <= Date.now() ||
      !options.allowedClientIds.includes(connection.clientId) ||
      !(await activeUser(userId))
    )
      return null;
    const [consent, client] = await Promise.all([
      db.oauthConsent.findFirst({
        where: { referenceId: id, userId, clientId: connection.clientId },
      }),
      db.oauthClient.findUnique({ where: { clientId: connection.clientId } }),
    ]);
    if (!consent || !consent.resources.includes(options.resource) || !client || client.disabled)
      return null;
    return { connection, consent, client };
  }

  const plugins = createExternalAgentProvider(
    options,
    {
      postLogin: {
        page: new URL('/auth/external-agent', options.webOrigin).href,
        shouldRedirect: async ({ user }) => {
          if (!user?.emailVerified || !(await activeUser(user.id)))
            throw new APIError('FORBIDDEN', { error: 'access_denied' });
          return false;
        },
        consentReferenceId: async ({ user, scopes }) => {
          const query = new URLSearchParams((await getOAuthProviderState())?.query);
          const clientId = query.get('client_id');
          if (
            !user?.emailVerified ||
            !clientId ||
            !options.allowedClientIds.includes(clientId) ||
            !(await activeUser(user.id))
          )
            throw new APIError('FORBIDDEN', { error: 'access_denied' });
          const store = requests.getStore();
          const rememberGrant = (credentialId: string) => {
            if (store?.acceptingConsent)
              store.consentGrant = { userId: user.id, clientId, scopes: [...scopes], credentialId };
          };
          const existing = await db.externalAgentConnection.findFirst({
            where: {
              userId: user.id,
              clientId,
              resource: options.resource,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
          });
          if (existing) {
            rememberGrant(existing.id);
            return existing.id;
          }
          // No product authority is created by login, a rejected consent, or discovery.
          if (!store?.acceptingConsent) return 'ungranted';
          const connection = await db.externalAgentConnection.create({
            data: {
              id: randomUUID(),
              userId: user.id,
              clientId,
              resource: options.resource,
              expiresAt: new Date(Date.now() + CONNECTION_LIFETIME_MS),
            },
          });
          rememberGrant(connection.id);
          return connection.id;
        },
      },
      customAccessTokenClaims: async ({ user, referenceId, resources, scopes }) => {
        if (!user || !referenceId || resources?.length !== 1 || resources[0] !== options.resource)
          throw invalidGrant();
        const grant = await currentGrant(referenceId, user.id);
        if (
          !grant ||
          !scopes.every(
            (scope) => grant.consent.scopes.includes(scope) && allowedOAuthScopes.includes(scope),
          )
        )
          throw invalidGrant();
        return { [CONNECTION_CLAIM]: referenceId };
      },
    },
    cimdFetch,
  );
  const provider = plugins.find((plugin) => plugin.id === 'oauth-provider');
  if (!provider || !('options' in provider)) throw new Error('OAuth provider is required');

  const policy = {
    id: 'memoflow-external-agent-policy',
    hooks: {
      before: [
        {
          matcher: (ctx: { path?: string }) => ctx.path?.startsWith('/oauth2/') === true,
          handler: createAuthMiddleware(async (ctx) => {
            // Client/resource administration belongs to server configuration, never public sessions.
            if (
              ![
                '/oauth2/authorize',
                '/oauth2/continue',
                '/oauth2/consent',
                '/oauth2/token',
                '/oauth2/revoke',
                '/oauth2/introspect',
                '/oauth2/userinfo',
              ].includes(ctx.path)
            ) {
              throw new APIError('NOT_FOUND');
            }
            const request = requests.getStore();
            const api = getOAuthProviderApi(ctx, provider.options);
            if (ctx.path === '/oauth2/revoke' && typeof ctx.body?.token === 'string') {
              const digest = await api.hashToken(ctx.body.token, 'refresh_token');
              const token = await db.oauthRefreshToken.findUnique({ where: { token: digest } });
              if (token && token.clientId !== ctx.body.client_id) throw invalidGrant();
              if (request && token?.clientId === ctx.body.client_id && token?.referenceId) {
                request.revokedConnection = token.referenceId;
                request.revokedOwner = { userId: token.userId, clientId: token.clientId };
              }
              return;
            }
            if (ctx.path !== '/oauth2/token') return;
            if (
              ctx.body?.grant_type === 'authorization_code' &&
              typeof ctx.body.code === 'string'
            ) {
              const digest = await api.hashToken(ctx.body.code, 'authorization_code');
              const rows = await db.oauthRefreshToken.findMany({
                where: { authorizationCodeId: digest },
                select: { referenceId: true },
              });
              if (request)
                request.codeConnections = rows.flatMap((row) =>
                  row.referenceId ? [row.referenceId] : [],
                );
            }
            if (ctx.body?.grant_type !== 'refresh_token') return;
            const input = z
              .object({ refresh_token: z.string().min(1).max(4096), client_id: z.string().min(1) })
              .safeParse(ctx.body);
            if (!input.success) throw invalidGrant();
            // Provider's own hash API is the only owner of stored token representation.
            const digest = await getOAuthProviderApi(ctx, provider.options).hashToken(
              input.data.refresh_token,
              'refresh_token',
            );
            const token = await db.oauthRefreshToken.findUnique({ where: { token: digest } });
            if (!token || token.clientId !== input.data.client_id || !token.referenceId)
              throw invalidGrant();
            const grant = await currentGrant(token.referenceId, token.userId, token.clientId);
            // Explicit refresh scopes must still be grantable; an unspecified
            // scope keeps the stored set, and the call path filters write scopes
            // out while the OAuth write switch is off.
            const explicitScopes: string[] | undefined =
              typeof ctx.body.scope === 'string' ? ctx.body.scope.split(' ') : undefined;
            const requestedScopes: string[] = explicitScopes ?? token.scopes;
            if (
              !grant ||
              !requestedScopes.every((scope) => grant.consent.scopes.includes(scope)) ||
              (explicitScopes !== undefined &&
                !explicitScopes.every((scope) => allowedOAuthScopes.includes(scope)))
            )
              throw invalidGrant();
            if (!request) throw invalidGrant();
            request.refresh = { userId: token.userId, clientId: token.clientId };
          }),
        },
      ],
    },
    endpoints: {
      externalAgentConsentRequest: createAuthEndpoint(
        '/external-agent/consent-request',
        {
          method: 'POST',
          body: ConsentBodySchema,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const query = new URLSearchParams((await getOAuthProviderState())?.query);
          const clientId = query.get('client_id');
          if (!clientId || !options.allowedClientIds.includes(clientId))
            throw new APIError('FORBIDDEN');
          const client = await getOAuthProviderApi(ctx, provider.options).getClient(clientId);
          if (!client || client.disabled) throw new APIError('FORBIDDEN');
          const scopes = (query.get('scope') ?? '').split(' ').filter(Boolean);
          if (!scopes.every((scope) => allowedOAuthScopes.includes(scope)))
            throw new APIError('FORBIDDEN');
          const userId = ctx.context.session.user.id;
          const existing = await db.externalAgentConnection.findFirst({
            where: {
              userId,
              clientId,
              resource: options.resource,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
          });
          const prior = existing
            ? await db.oauthConsent.findFirst({
                where: { referenceId: existing.id, userId, clientId },
                select: { scopes: true },
              })
            : null;
          return ctx.json({
            clientId,
            clientHost: new URL(clientId).host,
            name: client.name ?? clientId,
            scopes,
            existingScopes: prior?.scopes ?? [],
            resource: options.resource,
            lifetimeDays: 90,
            writeEnabled: allowWrite,
          });
        },
      ),
    },
  };

  return {
    plugins: [...plugins, policy],
    async handle(request: Request, body: unknown, operation: () => Promise<Response>) {
      const path = new URL(request.url).pathname;
      const input = z.object({ accept: z.boolean().optional() }).passthrough().safeParse(body);
      const state: {
        acceptingConsent: boolean;
        refresh?: { userId: string; clientId: string };
        revokedConnection?: string;
        revokedOwner?: { userId: string; clientId: string };
        codeConnections?: string[];
        consentGrant?: {
          userId: string;
          clientId: string;
          scopes: string[];
          credentialId?: string;
        };
      } = {
        acceptingConsent:
          path.endsWith('/oauth2/consent') && input.success && input.data.accept === true,
      };
      const requestId = request.headers.get('x-request-id') ?? 'unavailable';
      const run = () =>
        requests.run(state, async () => {
          const response = await operation();
          // Protocol denials may intentionally invalidate a replayed family;
          // infrastructure failures must roll back a partially rotated family.
          if (response.status >= 500) throw response;
          if (state.refresh && (await db.oauthRefreshToken.count({ where: state.refresh })) === 0) {
            // The provider has invalidated its (user, client) family. Invalidate JWT authority too.
            await db.externalAgentConnection.updateMany({
              where: { ...state.refresh, revokedAt: null },
              data: { revokedAt: new Date() },
            });
          }
          if (state.revokedConnection && response.ok) {
            // RFC 7009 refresh revocation also ends this product authorization.
            await db.externalAgentConnection.updateMany({
              where: { id: state.revokedConnection, revokedAt: null },
              data: { revokedAt: new Date() },
            });
            audit(
              {
                effect: 'credential',
                scopeDecision: 'allowed',
                credentialType: 'oauth',
                credentialId: state.revokedConnection,
                clientId: state.revokedOwner?.clientId,
                identityId: state.revokedOwner?.userId,
                tool: 'oauth_revoke',
                outcome: 'REVOKED',
              },
              requestId,
            );
          }
          for (const id of new Set(state.codeConnections)) {
            if ((await db.oauthRefreshToken.count({ where: { referenceId: id } })) === 0) {
              await db.externalAgentConnection.updateMany({
                where: { id, revokedAt: null },
                data: { revokedAt: new Date() },
              });
            }
          }
          if (path.endsWith('/oauth2/consent') && !response.ok) throw response;
          if (path.endsWith('/oauth2/consent') && response.ok) {
            const granted = state.consentGrant;
            if (granted)
              audit(
                {
                  effect: 'credential',
                  scopeDecision: 'allowed',
                  credentialType: 'oauth',
                  credentialId: granted.credentialId,
                  clientId: granted.clientId,
                  identityId: granted.userId,
                  tool: 'oauth_consent_grant',
                  outcome: 'OK',
                },
                requestId,
              );
            else if (input.success && input.data.accept === false) {
              const identityId = await (resolveIdentity ?? options.resolveIdentity)?.(
                request,
              ).catch(() => null);
              audit(
                {
                  effect: 'credential',
                  scopeDecision: 'denied',
                  credentialType: 'oauth',
                  clientId:
                    new URLSearchParams(String(input.data.oauth_query ?? '')).get('client_id') ??
                    undefined,
                  identityId: identityId ?? undefined,
                  tool: 'oauth_consent_deny',
                  outcome: 'DENIED',
                },
                requestId,
              );
            }
          }
          return response;
        });
      return ['/oauth2/token', '/oauth2/consent', '/oauth2/revoke'].some((suffix) =>
        path.endsWith(suffix),
      )
        ? store.serialize(run).catch((error: unknown) => {
            if (error instanceof Response) return error;
            throw error;
          })
        : run();
    },
    async authenticateClaims(value: unknown): Promise<VerifiedOAuthPrincipal | null> {
      return store.bounded(async () => {
        const parsed = ClaimsSchema.safeParse(value);
        if (!parsed.success) return null;
        const claims = parsed.data;
        const grant = await currentGrant(claims[CONNECTION_CLAIM], claims.sub, claims.client_id);
        if (!grant) return null;
        const tokenScopes = claims.scope.split(' ');
        const scopes = allowedScopes.filter(
          (scope) => tokenScopes.includes(scope) && grant.consent.scopes.includes(scope),
        );
        if (!scopes.length) return null;
        await db.externalAgentConnection.update({
          where: { id: grant.connection.id },
          data: { lastUsedAt: new Date() },
        });
        return {
          identityId: claims.sub,
          credentialId: grant.connection.id,
          credentialType: 'oauth',
          scopes,
          clientId: claims.client_id,
          consentScopes: grant.consent.scopes,
        };
      });
    },
    async list(userId: string) {
      return store.bounded(async () => {
        if (!(await activeUser(userId))) throw new Error('Inactive account');
        const rows = await db.externalAgentConnection.findMany({
          where: { userId },
          take: 100,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        const [clients, consents] = await Promise.all([
          db.oauthClient.findMany({
            where: { clientId: { in: rows.map((row) => row.clientId) } },
            select: { clientId: true, name: true },
          }),
          db.oauthConsent.findMany({
            where: { userId, referenceId: { in: rows.map((row) => row.id) } },
            select: { referenceId: true, scopes: true },
          }),
        ]);
        return rows.map((row) => {
          const client = clients.find((client) => client.clientId === row.clientId);
          const consent = consents.find((consent) => consent.referenceId === row.id);
          return {
            id: row.id,
            clientId: row.clientId,
            name: client?.name ?? row.clientId,
            resource: row.resource,
            createdAt: row.createdAt,
            expiresAt: row.expiresAt,
            lastUsedAt: row.lastUsedAt,
            revokedAt: row.revokedAt,
            scopes: consent?.scopes ?? [],
          };
        });
      });
    },
    async revoke(userId: string, id?: string) {
      return store.serialize(async () => {
        const connections = await db.externalAgentConnection.findMany({
          where: { userId, ...(id ? { id } : {}) },
          select: { id: true },
        });
        const ids = connections.map((connection) => connection.id);
        await db.externalAgentConnection.updateMany({
          where: { id: { in: ids }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await db.oauthAccessToken.deleteMany({ where: { userId, referenceId: { in: ids } } });
        await db.oauthRefreshToken.deleteMany({ where: { userId, referenceId: { in: ids } } });
        await db.oauthConsent.deleteMany({ where: { userId, referenceId: { in: ids } } });
      });
    },
    async consumeReadQuota(id: string) {
      const perMinute =
        options.readQuotaPerMinute ?? DEFAULT_EXTERNAL_AGENT_RATE_LIMITS.credentialPerMinute;
      return store.bounded(async () => {
        const count = await db.$executeRaw`
        UPDATE external_agent_connections
        SET rate_count = CASE WHEN rate_window <= CURRENT_TIMESTAMP - INTERVAL '1 minute' THEN 1 ELSE rate_count + 1 END,
            rate_window = CASE WHEN rate_window <= CURRENT_TIMESTAMP - INTERVAL '1 minute' THEN CURRENT_TIMESTAMP ELSE rate_window END
        WHERE id = ${id} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
          AND (rate_window <= CURRENT_TIMESTAMP - INTERVAL '1 minute' OR rate_count < ${perMinute})`;
        return count === 1;
      });
    },
  };
}

/**
 * Revalidates an OAuth grant using the mutation transaction's own connection.
 * Connection and consent rows are locked with `FOR SHARE` through the
 * mutation/receipt commit, matching the PAT authority semantics (#971).
 * @param tx - Receipt transaction.
 * @param principal - Verified bearer principal from the gateway.
 * @param options - OAuth write switch and the host's account-activity check.
 * @param requiredScope - Scope the current tool needs.
 * @returns Current consent scopes for receipt metadata, or `null` when stale.
 */
export async function readExternalAgentOAuthAuthority(
  tx: Prisma.TransactionClient,
  principal: {
    identityId: string;
    credentialId: string;
    clientId: string;
    scopes: readonly string[];
  },
  options: {
    writeEnabled: boolean;
    accountIsActive: (identityId: string) => Promise<boolean>;
  },
  requiredScope: string,
): Promise<{ consentScopes: readonly string[] } | null> {
  if (!options.writeEnabled) return null;
  // SHARE blocks revocation/scope updates until the receipt commits.
  await tx.$queryRaw`
    SELECT id FROM external_agent_connections WHERE id = ${principal.credentialId} FOR SHARE
  `;
  const connection = await tx.externalAgentConnection.findUnique({
    where: { id: principal.credentialId },
  });
  if (
    !connection ||
    connection.userId !== principal.identityId ||
    connection.clientId !== principal.clientId ||
    connection.revokedAt !== null ||
    connection.expiresAt.getTime() <= Date.now()
  )
    return null;
  await tx.$queryRaw`
    SELECT id FROM "oauthConsent"
    WHERE "referenceId" = ${principal.credentialId}
      AND "userId" = ${principal.identityId}
      AND "clientId" = ${principal.clientId}
    FOR SHARE
  `;
  const consent = await tx.oauthConsent.findFirst({
    where: {
      referenceId: principal.credentialId,
      userId: principal.identityId,
      clientId: principal.clientId,
    },
  });
  if (
    !consent ||
    !consent.resources.includes(connection.resource) ||
    !consent.scopes.includes(requiredScope) ||
    principal.scopes.some((scope) => !consent.scopes.includes(scope))
  )
    return null;
  const [client, user] = await Promise.all([
    tx.oauthClient.findUnique({ where: { clientId: principal.clientId } }),
    tx.cloudAuthUser.findUnique({
      where: { id: principal.identityId },
      select: { disabledAt: true },
    }),
  ]);
  if (
    !client ||
    client.disabled === true ||
    !user ||
    user.disabledAt !== null ||
    !(await options.accountIsActive(principal.identityId))
  )
    return null;
  return { consentScopes: consent.scopes };
}
