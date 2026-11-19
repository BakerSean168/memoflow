import type { GatewayToolCheckpoint } from '@memoflow/agent-gateway';
import { z } from 'zod';
import { CreateScopedPatSchema } from '@memoflow/agent-gateway';
import { ExternalMutationError } from '@memoflow/database/transaction';
import type { PilotAdmission } from './pilot-admission';
import { createReadGateway, toNodeHandler } from '@memoflow/agent-gateway/server';
import type {
  GoalReadPort,
  GatewayWritePort,
  GatewayAssistedPort,
  NotificationReadPort,
  TaskReadPort,
  LabelReadPort,
  AssistantConversationReadPort,
  AgentArchiveReadPort,
  RoutineReadPort,
  RelationReadPort,
  GatewayAuditEvent,
  GatewayDiagnostic,
} from '@memoflow/agent-gateway';
import type { createScopedPatService, createCloudAuth } from '@memoflow/cloud-auth/server';
import type { IApiModule } from '../../shared/contracts/api-module';
import type { AuthenticatedRequest } from '../../shared/infrastructure/http/middlewares/auth-middleware';
import type { RequestContextCarrierRequest } from '../../shared/infrastructure/http/middlewares/request-context.middleware';
import { ExternalAgentAuditQuerySchema, type ExternalAgentAuditQueryPort } from './audit-query';

interface Options {
  readonly enabled: boolean;
  readonly toolCheckpoint: GatewayToolCheckpoint;
  readonly writes?: GatewayWritePort;
  readonly assisted?: GatewayAssistedPort;
  readonly admission: PilotAdmission;
  readonly audience: string;
  readonly cursorSecret: string;
  readonly trustedOrigins: readonly string[];
  readonly pats: ReturnType<typeof createScopedPatService>;
  readonly oauth?: ReturnType<typeof createCloudAuth>['externalAgents'];
  readonly goals: GoalReadPort;
  readonly tasks?: TaskReadPort;
  readonly labels?: LabelReadPort;
  readonly notifications?: NotificationReadPort;
  readonly assistantConversation?: AssistantConversationReadPort;
  readonly agents?: AgentArchiveReadPort;
  readonly routines?: RoutineReadPort;
  readonly relations?: RelationReadPort;
  readonly audit: (event: GatewayAuditEvent) => void;
  readonly auditQuery: ExternalAgentAuditQueryPort;
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
          if (
            !(await options.admission.consumeIp(req.ip ?? req.socket.remoteAddress ?? 'unknown'))
          ) {
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
        await toNodeHandler({
          fetch: (request) => gateway.fetch(request, context),
        })(req, res, req.body);
      });
      const path = '/agent-connections/pats';
      const auditEventsPath = '/agent-connections/audit-events';
      router.use(
        '/agent-connections',
        (req, res, next) => {
          res.locals.externalAgentAuditHandled = true;
          const started = Date.now();
          // Express restores req.url as nested routers unwind; capture the lane now.
          const oauthManagement = req.path.startsWith('/oauth');
          const auditQueryLane = req.path.startsWith('/audit-events');
          // Reading audit facts is not a credential mutation lane, so it emits no
          // credential event of its own and keeps the terminal response cache-free.
          if (!auditQueryLane) {
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
          }
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
        const result = await options.pats
          .create(
            identityId,
            parsed.data,
            (req as typeof req & RequestContextCarrierRequest).requestContext,
          )
          .catch((error: unknown) => {
            if (!(error instanceof ExternalMutationError)) throw error;
            const status =
              error.code === 'FORBIDDEN'
                ? 403
                : error.code === 'VALIDATION_ERROR' || error.code === 'RESPONSE_TOO_LARGE'
                  ? 400
                  : error.code === 'UNAVAILABLE'
                    ? 503
                    : 409;
            res.status(status).json({ error: error.code });
            return null;
          });
        if (!result) return;
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
      router.get(auditEventsPath, async (req, res) => {
        const identityId = (req as AuthenticatedRequest).user?.identityId;
        if (!identityId) {
          res.sendStatus(401);
          return;
        }
        const parsed = ExternalAgentAuditQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          res.status(400).json({ error: 'INVALID_INPUT' });
          return;
        }
        const { credentialId, requestId, from, to, limit } = parsed.data;
        const page = await options.auditQuery.list(identityId, {
          credentialId,
          requestId,
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
          limit,
        });
        res.json({
          data: {
            items: page.items.map((entry) => ({
              credentialId: entry.credentialId,
              effect: entry.effect,
              tool: entry.tool,
              outcome: entry.outcome,
              scopeDecision: entry.scopeDecision,
              requestId: entry.requestId,
              traceId: entry.traceId,
              receiptId: entry.receiptId,
              replayed: entry.replayed,
              durationMs: entry.durationMs,
              createdAt: entry.createdAt.toISOString(),
            })),
            hasMore: page.hasMore,
          },
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
