import type { IAIConversationApiClient, IResultIpcClient } from '../types';
import { AIChannels } from '@memoflow/desktop-contracts';
import type {
  AIConversationClientDTO,
  ConversationListRes,
  CreateConversationReq,
  UpdateConversationReq,
} from '@memoflow/ai-contracts';
import type { Result } from '@memoflow/transport-contracts/result';

/**
 * IPC adapter for AI conversations.
 * Returns Result envelopes — never throws (residual 97).
 */
export class AIConversationIpcAdapter implements IAIConversationApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async createConversation(
    request: CreateConversationReq,
  ): Promise<Result<AIConversationClientDTO>> {
    return this.ipcClient.invoke<AIConversationClientDTO>(AIChannels.CONVERSATION_CREATE, request);
  }

  async updateConversation(
    id: string,
    request: UpdateConversationReq,
  ): Promise<Result<AIConversationClientDTO>> {
    return this.ipcClient.invoke<AIConversationClientDTO>(AIChannels.CONVERSATION_UPDATE, {
      id,
      ...request,
    });
  }

  async getConversations(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<Result<ConversationListRes>> {
    return this.ipcClient.invoke<ConversationListRes>(AIChannels.CONVERSATION_LIST, params);
  }

  async getConversationById(id: string): Promise<Result<AIConversationClientDTO>> {
    return this.ipcClient.invoke<AIConversationClientDTO>(AIChannels.CONVERSATION_GET, id);
  }

  async deleteConversation(id: string): Promise<Result<void>> {
    return this.ipcClient.invoke<void>(AIChannels.CONVERSATION_DELETE, id);
  }
}
