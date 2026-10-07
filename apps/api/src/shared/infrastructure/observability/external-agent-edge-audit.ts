import type { RequestHandler } from 'express';
import type { GatewayAuditEvent } from '@memoflow/agent-gateway';
import type { RequestContextCarrierRequest } from '../http/middlewares/request-context.middleware';

/**
 * Records early CORS/parser/aborted attempts that never reach the Gateway module.
 * @param audit - Dedicated minimal audit sink.
 * @returns An edge observer installed after canonical context and before security/parsing.
 */
export function createExternalAgentEdgeAudit(
  audit: (event: GatewayAuditEvent) => void,
): RequestHandler {
  return (req, res, next) => {
    const credentialPath = '/api/v1/agent-connections/pats';
    const credential = req.path === credentialPath || req.path.startsWith(`${credentialPath}/`);
    if (req.path !== '/mcp' && !credential) {
      next();
      return;
    }
    const context = (req as typeof req & RequestContextCarrierRequest).requestContext;
    let settled = false;
    const settle = (aborted: boolean) => {
      if (settled) return;
      settled = true;
      if (res.locals.externalAgentAuditHandled) return;
      try {
        audit({
          version: '1',
          effect: credential ? 'credential' : 'read',
          scopeDecision: 'denied',
          requestId: context.requestId,
          traceId: context.traceId,
          tool: credential
            ? req.method === 'POST'
              ? 'pat_create'
              : req.method === 'DELETE'
                ? 'pat_revoke'
                : 'pat_list'
            : 'transport',
          outcome: aborted ? 'ABORTED' : `HTTP_${res.statusCode}`,
          durationMs: Date.now() - context.startedAt,
        });
      } catch {
        /* Observer failures do not alter the terminal response. */
      }
    };
    res.once('finish', () => settle(false));
    res.once('close', () => settle(true));
    next();
  };
}
