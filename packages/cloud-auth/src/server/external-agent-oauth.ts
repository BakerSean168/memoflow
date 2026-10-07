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
  CONNECTION_CLAIM,
  CONNECTION_LIFETIME_MS,
  EXTERNAL_AGENT_OAUTH_SCOPES,
  EXTERNAL_AGENT_SCOPES,
  createExternalAgentProvider,
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
}

/** Product grant policy around the provider's code/PKCE/token implementation. */
export function createExternalAgentOAuth(
  store: ReturnType<typeof createOAuthStore>,
  options: ExternalAgentOAuthOptions,
  closureBlocked: (identityId: string) => Promise<boolean>,
) {
  const db = store.db;
  const requests = new AsyncLocalStorage<{
    acceptingConsent: boolean;
    refresh?: { userId: string; clientId: string };
    revokedConnection?: string;
    codeConnections?: string[];
  }>();
  const invalidGrant = () => new APIError('BAD_REQUEST', { error: 'invalid_grant' });

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

  const plugins = createExternalAgentProvider(options, {
    postLogin: {
      page: new URL('/auth/external-agent', options.webOrigin).href,
      shouldRedirect: async ({ user }) => {
        if (!user?.emailVerified || !(await activeUser(user.id)))
          throw new APIError('FORBIDDEN', { error: 'access_denied' });
        return false;
      },
      consentReferenceId: async ({ user }) => {
        const query = new URLSearchParams((await getOAuthProviderState())?.query);
        const clientId = query.get('client_id');
        if (
          !user?.emailVerified ||
          !clientId ||
          !options.allowedClientIds.includes(clientId) ||
          !(await activeUser(user.id))
        )
          throw new APIError('FORBIDDEN', { error: 'access_denied' });
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
        if (existing) return existing.id;
        // No product authority is created by login, a rejected consent, or discovery.
        if (!requests.getStore()?.acceptingConsent) return 'ungranted';
        const connection = await db.externalAgentConnection.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            clientId,
            resource: options.resource,
            expiresAt: new Date(Date.now() + CONNECTION_LIFETIME_MS),
          },
        });
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
          (scope) =>
            grant.consent.scopes.includes(scope) && EXTERNAL_AGENT_OAUTH_SCOPES.includes(scope),
        )
      )
        throw invalidGrant();
      return { [CONNECTION_CLAIM]: referenceId };
    },
  });
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
              if (request && token?.clientId === ctx.body.client_id && token?.referenceId)
                request.revokedConnection = token.referenceId;
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
            const requestedScopes: string[] =
              typeof ctx.body.scope === 'string' ? ctx.body.scope.split(' ') : token.scopes;
            if (!grant || !requestedScopes.every((scope) => grant.consent.scopes.includes(scope)))
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
          if (!scopes.every((scope) => EXTERNAL_AGENT_OAUTH_SCOPES.includes(scope)))
            throw new APIError('FORBIDDEN');
          return ctx.json({
            clientId,
            name: client.name ?? clientId,
            scopes,
            resource: options.resource,
            lifetimeDays: 90,
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
        codeConnections?: string[];
      } = {
        acceptingConsent:
          path.endsWith('/oauth2/consent') && input.success && input.data.accept === true,
      };
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
        const scopes = EXTERNAL_AGENT_SCOPES.filter(
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
      return store.bounded(async () => {
        const count = await db.$executeRaw`
        UPDATE external_agent_connections
        SET rate_count = CASE WHEN rate_window <= CURRENT_TIMESTAMP - INTERVAL '1 minute' THEN 1 ELSE rate_count + 1 END,
            rate_window = CASE WHEN rate_window <= CURRENT_TIMESTAMP - INTERVAL '1 minute' THEN CURRENT_TIMESTAMP ELSE rate_window END
        WHERE id = ${id} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
          AND (rate_window <= CURRENT_TIMESTAMP - INTERVAL '1 minute' OR rate_count < 60)`;
        return count === 1;
      });
    },
  };
}
