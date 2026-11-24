import type { AgentArchiveReadPort } from '@memoflow/agent-gateway';
import { AgentRegistryError, type IAgentInstanceReadPort } from '@memoflow/ai';

/**
 * Maps the AI owner port's not-found error to the Gateway's nullable lookup.
 * The projection itself already strips host-local configuration.
 */
export function bindLocalAgentArchiveReadPort(
  port: IAgentInstanceReadPort,
): AgentArchiveReadPort {
  return {
    list: (context) => port.list(context),
    get: async (instanceId, context) => {
      try {
        return await port.get(instanceId, context);
      } catch (error) {
        if (error instanceof AgentRegistryError && error.code === 'NOT_FOUND') return null;
        throw error;
      }
    },
  };
}
