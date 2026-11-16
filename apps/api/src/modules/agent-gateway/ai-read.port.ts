import type { AgentArchiveReadPort, AssistantConversationReadPort } from '@memoflow/agent-gateway';
import {
  AgentRegistryError,
  type AssistantConversationExternalReadPort,
  type IAgentInstanceReadPort,
} from '@memoflow/ai';

/**
 * Binds the AI application-layer bounded projection to the gateway seam.
 *
 * The projection already owns pagination, truncation and cross-owner
 * NOT_FOUND, so the gateway only sees the application port.
 */
export function bindAssistantConversationReadPort(
  port: AssistantConversationExternalReadPort,
): AssistantConversationReadPort {
  return port;
}

/** Maps the AI port's not-found error to the gateway's nullable lookup. */
export function bindAgentArchiveReadPort(port: IAgentInstanceReadPort): AgentArchiveReadPort {
  return {
    list: (cx) => port.list(cx),
    get: async (instanceId, cx) => {
      try {
        return await port.get(instanceId, cx);
      } catch (error) {
        if (error instanceof AgentRegistryError && error.code === 'NOT_FOUND') return null;
        throw error;
      }
    },
  };
}
