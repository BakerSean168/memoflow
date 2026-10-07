import { z } from 'zod';
import { CreateScopedPatSchema } from '@memoflow/contracts/agent-gateway';
import type { PilotAdmission } from './pilot-admission';
import { createReadGateway, toNodeHandler } from '@memoflow/agent-gateway/server';
import type {
  GoalReadPort,
  TaskReadPort,
  GatewayAuditEvent,
  GatewayDiagnostic,
} from '@memoflow/agent-gateway';
import type { createScopedPatService, createCloudAuth } from '@memoflow/cloud-auth/server';
import type { IApiModule } from '../../shared/contracts/api-module';
import type { AuthenticatedRequest } from '../../shared/infrastructure/http/middlewares/auth-middleware';
import type { RequestContextCarrierRequest } from '../../shared/infrastructure/http/middlewares/request-context.middleware';

interface Options {
  readonly enabled: boolean;
  readonly admission: PilotAdmission;
  readonly audience: string;
  readonly cursorSecret: string;
  readonly trustedOrigins: readonly string[];
  readonly pats: ReturnType<typeof createScopedPatService>;
  readonly oauth?: ReturnType<typeof createCloudAuth>['externalAgents'];
  readonly goals: GoalReadPort;
  readonly tasks?: TaskReadPort;
  readonly audit: (event: GatewayAuditEvent) => void;
  readonly diagnose?: (event: GatewayDiagnostic) => void;
}
/**
 * Binds the private Goal read pilot and first-party PAT management to the API host.
 * @param options - Already composed owner and Cloud Auth application ports.
 * @returns A transport-only module handle; default-off pilots mount no routes.
 */
export function composeAgentGatewayModule(options: Options): IApiModule {
  const resourceMetadataUrl = options.oauth
    ? new URL('/.well-known/oauth-protected-resource/mcp', options.audience).href
    : undefined;
  const gateway = createReadGateway({
    ...options,
    resourceMetadataUrl,
    credentials: {
      authenticate: (authorization, context) =>
        /^Bearer mfp_/i.test(authorization ?? '')
          ? options.pats.authenticate(authorization, context)
          : (options.oauth?.authenticate(authorization) ?? Promise.resolve(null)),
      consumeReadQuota: (id, type) =>
        type === 'pat'
          ? options.pats.consumeReadQuota(id)
          : (options.oauth?.consumeReadQuota(id) ?? Promise.resolve(false)),
    },
    consumeOwnerQuota: options.admission.consumeOwner,
  });
  return {
    name: 'AgentGateway',
    async register({ app, router, middleware }) {
      if (!options.enabled) return;
      await options.admission.start();
      const requireEmailVerified = middleware.requireEmailVerified;
      if (!requireEmailVerified)
        throw new Error('PAT management requires verified-email middleware');
      app.all('/mcp', async (req, res) => {
        const started = Date.now();
        const context = (req as typeof req & RequestContextCarrierRequest).requestContext;
        const deny = (status: number, outcome: string) => {
          res.locals.externalAgentAuditHandled = true;
          if (status === 401 && resourceMetadataUrl) {
            res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);
          }
          if (status === 429 || status === 503) res.setHeader('Retry-After', '60');
          options.audit({
            version: '1',
            effect: 'read',
            scopeDecision: 'denied',
            tool: 'transport',
            outcome,
            durationMs: Date.now() - started,
            requestId: context?.requestId ?? 'unavailable',
            traceId: context?.traceId ?? 'unavailable',
          });
          res.status(status).json({ error: outcome });
        };
        res.setHeader('Cache-Control', 'no-store');
        if (req.headers.host !== new URL(options.audience).host) {
          deny(403, 'HOST_DENIED');
          return;
        }
        const authHeaderCount = req.rawHeaders.filter(
          (_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === 'authorization',
        ).length;
        if (authHeaderCount > 1) {
          deny(401, 'INVALID_CREDENTIAL');
          return;
        }
        try {
          if (!(await options.admission.consumeIp(req.ip ?? req.socket.remoteAddress ?? 'unknown'))) {
            deny(429, 'RATE_LIMITED');
            return;
          }
        } catch {
          deny(503, 'UNAVAILABLE');
          return;
        }
        if (!context) {
          res.status(500).json({ error: 'MISSING_REQUEST_CONTEXT' });
          return;
        }
        res.locals.externalAgentAuditHandled = true;
        await toNodeHandler({ fetch: (request) => gateway.fetch(request, context) })(
          req,
          res,
          req.body,
        );
      });
      const path = '/agent-connections/pats';
      router.use(
        '/agent-connections',
        (req, res, next) => {
          res.locals.externalAgentAuditHandled = true;
          const started = Date.now();
          // Express restores req.url as nested routers unwind; capture the lane now.
          const oauthManagement = req.path.startsWith('/oauth');
          res.once('finish', () => {
            const context = (req as typeof req & RequestContextCarrierRequest).requestContext;
            options.audit({
              version: '1',
              effect: 'credential',
              scopeDecision: res.statusCode < 400 ? 'allowed' : 'denied',
              requestId: context?.requestId ?? 'unavailable',
              traceId: context?.traceId ?? 'unavailable',
              identityId: (req as AuthenticatedRequest).user?.identityId,
              credentialId:
                typeof res.locals.externalAgentCredentialId === 'string'
                  ? res.locals.externalAgentCredentialId
                  : undefined,
              tool: oauthManagement
                ? req.method === 'DELETE'
                  ? 'oauth_revoke'
                  : 'oauth_list'
                : req.method === 'POST'
                  ? 'pat_create'
                  : req.method === 'DELETE'
                    ? 'pat_revoke'
                    : 'pat_list',
              outcome: res.statusCode < 400 ? 'OK' : `HTTP_${res.statusCode}`,
              durationMs: Date.now() - started,
            });
          });
          next();
        },
        middleware.auth,
        requireEmailVerified,
        (req, res, next) => {
          res.setHeader('Cache-Control', 'no-store');
          if (
            req.method !== 'GET' &&
            (!req.headers.origin || !options.trustedOrigins.includes(req.headers.origin))
          ) {
            res.status(403).json({ error: 'ORIGIN_DENIED' });
            return;
          }
          next();
        },
      );
      router.post(path, async (req, res) => {
        const parsed = CreateScopedPatSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'INVALID_INPUT' });
          return;
        }
        const identityId = (req as AuthenticatedRequest).user?.identityId;
        if (!identityId) {
          res.sendStatus(401);
          return;
        }
        const result = await options.pats.create(
          identityId,
          parsed.data,
          (req as typeof req & RequestContextCarrierRequest).requestContext,
        );
        res.locals.externalAgentCredentialId = result.id;
        res.status(201).json({ data: result });
      });
      router.get('/agent-connections/capabilities', (_req, res) => {
        res.json({ oauth: Boolean(options.oauth) });
      });
      router.get(path, async (req, res) => {
        const identityId = (req as AuthenticatedRequest).user?.identityId;
        if (!identityId) {
          res.sendStatus(401);
          return;
        }
        res.json({
          data: await options.pats.list(
            identityId,
            (req as typeof req & RequestContextCarrierRequest).requestContext,
          ),
        });
      });
      router.delete(`${path}/:id`, async (req, res) => {
        const parsed = z.uuid().safeParse(req.params.id);
        if (!parsed.success) {
          res.status(400).json({ error: 'INVALID_INPUT' });
          return;
        }
        const identityId = (req as AuthenticatedRequest).user?.identityId;
        if (!identityId) {
          res.sendStatus(401);
          return;
        }
        res.locals.externalAgentCredentialId = parsed.data;
        // Owned and missing ids intentionally share the same outward result.
        await options.pats.revoke(
          identityId,
          parsed.data,
          (req as typeof req & RequestContextCarrierRequest).requestContext,
        );
        res.sendStatus(204);
      });
      if (options.oauth) {
        const oauth = options.oauth;
        router.get('/agent-connections/oauth', async (req, res) => {
          const identityId = (req as AuthenticatedRequest).user?.identityId;
          if (!identityId) {
            res.sendStatus(401);
            return;
          }
          res.json({ data: await oauth.list(identityId) });
        });
        router.delete('/agent-connections/oauth/:id', async (req, res) => {
          const id = z.uuid().safeParse(req.params.id);
          if (!id.success) {
            res.status(400).json({ error: 'INVALID_INPUT' });
            return;
          }
          const identityId = (req as AuthenticatedRequest).user?.identityId;
          if (!identityId) {
            res.sendStatus(401);
            return;
          }
          res.locals.externalAgentCredentialId = id.data;
          await oauth.revoke(identityId, id.data);
          res.sendStatus(204);
        });
      }
    },
    async destroy() {
      if (options.enabled) await options.admission.destroy();
    },
  };
}
