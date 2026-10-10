import {
  AgentRegistryCommandSchema,
  AgentRegistrySnapshotSchema,
  AgentConversationSelectionSchema,
  AgentInstanceSchema,
  type AgentConversationSelection,
  type AgentInstance,
  type AgentRegistryCommand,
  type AgentRegistrySnapshot,
} from '@memoflow/contracts/ai';
import { AIChannels } from '@memoflow/contracts/electron';
import { unwrapOrThrowError } from '@memoflow/contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import type { z } from 'zod';

/**
 * Shared instance management transport. Browser and Desktop use identical validated
 * commands while the host injects verified owner identity and enforces driver allowlists.
 */
export interface AgentRegistryClient {
  list(): Promise<AgentRegistrySnapshot>;
  conversationSelection?(conversationId: string): Promise<AgentConversationSelection | null>;
  execute(
    command: Exclude<AgentRegistryCommand, { action: 'list' }>,
  ): Promise<AgentInstance | AgentRegistrySnapshot | AgentConversationSelection | null>;
}

const resultSchema = AgentInstanceSchema.or(AgentRegistrySnapshotSchema)
  .or(AgentConversationSelectionSchema)
  .nullable();
function checked<T>(value: unknown, schema: z.ZodType<T>): T {
  return schema.parse(value);
}

export function createAgentRegistryHttpClient(http: IResultHttpClient): AgentRegistryClient {
  return {
    async list() {
      return checked(
        unwrapOrThrowError(await http.get('/ai/agent-instances')),
        AgentRegistrySnapshotSchema,
      );
    },
    async conversationSelection(conversationId) {
      return checked(
        await this.execute({ action: 'conversation_selection', conversationId }),
        AgentConversationSelectionSchema.nullable(),
      );
    },
    async execute(command) {
      return checked(
        unwrapOrThrowError(
          await http.post('/ai/agent-instances', AgentRegistryCommandSchema.parse(command)),
        ),
        resultSchema,
      );
    },
  };
}

export function createAgentRegistryIpcClient(ipc: IResultIpcClient): AgentRegistryClient {
  return {
    async list() {
      return checked(
        unwrapOrThrowError(await ipc.invoke(AIChannels.AGENT_INSTANCE, { action: 'list' })),
        AgentRegistrySnapshotSchema,
      );
    },
    async conversationSelection(conversationId) {
      return checked(
        await this.execute({ action: 'conversation_selection', conversationId }),
        AgentConversationSelectionSchema.nullable(),
      );
    },
    async execute(command) {
      return checked(
        unwrapOrThrowError(
          await ipc.invoke(AIChannels.AGENT_INSTANCE, AgentRegistryCommandSchema.parse(command)),
        ),
        resultSchema,
      );
    },
  };
}
