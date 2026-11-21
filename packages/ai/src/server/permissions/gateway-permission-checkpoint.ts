import type { GatewayPrincipal, GatewayToolCheckpoint } from '@memoflow/agent-gateway';
import { GatewayPermissionDeniedError } from '@memoflow/agent-gateway';
import { executeAuthorized, PermissionDeniedError } from './authorize';
import { permissionOperationForTool, type PermissionObject } from './operation-catalog';
import type { PermissionRepository } from './permission.repository';

/**
 * Write scope that covers each mutating business object. PAT issuance and OAuth
 * consent both required the user to choose these scopes; a write inside one is
 * a pre-authorized mutation. Objects without a gateway write scope (knowledge,
 * ai_permission) never qualify.
 */
const WRITE_SCOPE_BY_OBJECT: Partial<Record<PermissionObject, string>> = {
  goal: 'goals:write',
  key_result: 'goals:write',
  task: 'tasks:write',
  routine: 'routines:write',
  notification: 'notifications:write',
};

/**
 * Notification action execution fans out into other owners' commands, so it
 * stays outside MCP (#990). Only the notification read-state transition is
 * pre-authorized by `notifications:write`.
 */
const PREAUTHORIZED_WRITE_EXCLUSIONS: ReadonlySet<string> = new Set([
  'notification.execute_action',
]);

/** Scopes are checked by Gateway before entering this business-policy boundary. */
export function createGatewayPermissionCheckpoint(
  repository: PermissionRepository,
): GatewayToolCheckpoint {
  return async <T>(principal: GatewayPrincipal, tool: string, work: () => Promise<T>) => {
    const operation = permissionOperationForTool(tool);
    const writeScope =
      operation && operation.action !== 'read'
        ? WRITE_SCOPE_BY_OBJECT[operation.object]
        : undefined;
    try {
      return await executeAuthorized(
        repository,
        {
          owner: principal.identityId,
          // The credential id stays in every allow/deny audit record.
          agentId: `external-mcp:${principal.credentialId}`,
          operationId: operation?.id ?? tool,
          // The Gateway already gates credential type and the OAuth write
          // switch; a present write scope is the user's pre-authorization for
          // either credential lane (#1054).
          preAuthorizedWrite:
            writeScope !== undefined &&
            principal.scopes.includes(writeScope) &&
            !(operation && PREAUTHORIZED_WRITE_EXCLUSIONS.has(operation.id)),
        },
        work,
      );
    } catch (error) {
      if (error instanceof PermissionDeniedError)
        throw new GatewayPermissionDeniedError(error.decision);
      throw error;
    }
  };
}
