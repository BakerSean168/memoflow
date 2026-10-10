import { z } from 'zod';
import {
  LocalAgentClientCommandSchema,
  LocalAgentConnectionSchema,
  LocalAgentConversationSchema,
  LocalAgentStatusSchema,
  AssistantRuntimeApprovalResultSchema,
  AssistantRuntimeChoiceSchema,
  type AssistantRuntimeChoice,
  type LocalAgentClientCommand,
  type LocalAgentConnection,
  type LocalAgentConnectionInput,
  type LocalAgentConversation,
  type LocalAgentConversationCreate,
  type LocalAgentRequestResponse,
  type LocalAgentStatus,
} from '@memoflow/contracts/ai';
import { AIChannels } from '@memoflow/contracts/electron';
import { unwrapOrThrowError } from '@memoflow/contracts/result';
import type { IResultIpcClient } from '@memoflow/ipc-client';

/** Optional Desktop capability. Web hosts do not provide a local Agent client. */
export interface LocalAgentClient {
  getDefaultChoice(): Promise<AssistantRuntimeChoice>;
  setDefaultChoice(choice: AssistantRuntimeChoice): Promise<void>;
  listConnections(): Promise<LocalAgentConnection[]>;
  saveConnection(
    connection: LocalAgentConnectionInput,
    id?: string,
    expectedRevision?: number,
  ): Promise<LocalAgentConnection>;
  deleteConnection(id: string): Promise<void>;
  probeConnection(id: string): Promise<LocalAgentStatus>;
  listConversations(): Promise<LocalAgentConversation[]>;
  createConversation(conversation: LocalAgentConversationCreate): Promise<LocalAgentConversation>;
  respond(response: LocalAgentRequestResponse): Promise<boolean>;
}

export function createLocalAgentIpcClient(ipc: IResultIpcClient): LocalAgentClient {
  async function invoke<T>(command: LocalAgentClientCommand, schema: z.ZodType<T>): Promise<T> {
    const result = await ipc.invoke<unknown>(
      AIChannels.LOCAL_AGENT,
      LocalAgentClientCommandSchema.parse(command),
    );
    return schema.parse(unwrapOrThrowError(result));
  }
  return {
    getDefaultChoice: () => invoke({ action: 'get_default' }, AssistantRuntimeChoiceSchema),
    async setDefaultChoice(choice) {
      await invoke({ action: 'set_default', choice }, z.null());
    },
    listConnections: () =>
      invoke({ action: 'list_connections' }, z.array(LocalAgentConnectionSchema).max(100)),
    saveConnection: (connection, id, expectedRevision) =>
      invoke(
        { action: 'save_connection', connection, id, expectedRevision },
        LocalAgentConnectionSchema,
      ),
    async deleteConnection(id) {
      await invoke({ action: 'delete_connection', id }, z.null());
    },
    probeConnection: (id) => invoke({ action: 'probe_connection', id }, LocalAgentStatusSchema),
    listConversations: () =>
      invoke({ action: 'list_conversations' }, z.array(LocalAgentConversationSchema).max(1000)),
    createConversation: (conversation) =>
      invoke({ action: 'create_conversation', conversation }, LocalAgentConversationSchema),
    async respond(response) {
      return (await invoke({ action: 'respond', response }, AssistantRuntimeApprovalResultSchema))
        .accepted;
    },
  };
}
