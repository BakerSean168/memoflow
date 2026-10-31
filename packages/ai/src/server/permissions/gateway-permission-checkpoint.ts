import type { GatewayPrincipal, GatewayToolCheckpoint } from '@memoflow/agent-gateway';
import { GatewayPermissionDeniedError } from '@memoflow/agent-gateway';
import { executeAuthorized, PermissionDeniedError } from './authorize';
import { permissionOperationForTool } from './operation-catalog';
import type { PermissionRepository } from './permission.repository';

/** Scopes are checked by Gateway before entering this business-policy boundary. */
export function createGatewayPermissionCheckpoint(
  repository: PermissionRepository,
): GatewayToolCheckpoint {
  return async <T>(principal: GatewayPrincipal, tool: string, work: () => Promise<T>) => {
    try {
      return await executeAuthorized(
        repository,
        {
          owner: principal.identityId,
          agentId: `external-mcp:${principal.credentialId}`,
          operationId: permissionOperationForTool(tool)?.id ?? tool,
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
