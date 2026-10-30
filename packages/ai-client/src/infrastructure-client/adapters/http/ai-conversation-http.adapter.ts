import type { IAIConversationApiClient, IResultHttpClient } from '../types';
import type {
  AIConversationClientDTO,
  ConversationListRes,
  CreateConversationReq,
  UpdateConversationReq,
} from '@memoflow/ai-contracts';
import type { Result } from '@memoflow/transport-contracts/result';

/**
 * HTTP adapter for AI conversations.
 * Returns Result envelopes — never throws (residual 97).
 */
export class AIConversationHttpAdapter implements IAIConversationApiClient {
  private readonly baseUrl = '/ai/chat/conversations';

  constructor(private readonly httpClient: IResultHttpClient) {}

  async createConversation(
    request: CreateConversationReq,
  ): Promise<Result<AIConversationClientDTO>> {
    return this.httpClient.post<AIConversationClientDTO>(this.baseUrl, request);
  }

  async updateConversation(
    id: string,
    request: UpdateConversationReq,
  ): Promise<Result<AIConversationClientDTO>> {
    return this.httpClient.patch<AIConversationClientDTO>(`${this.baseUrl}/${id}`, request);
  }

  async getConversations(params?: {
    page?: number;
    pageSize?: number;
    status?: 'Active' | 'Archived';
  }): Promise<Result<ConversationListRes>> {
    return this.httpClient.get<ConversationListRes>(this.baseUrl, { params });
  }

  async getConversationById(id: string): Promise<Result<AIConversationClientDTO>> {
    return this.httpClient.get<AIConversationClientDTO>(`${this.baseUrl}/${id}`);
  }

  async deleteConversation(id: string): Promise<Result<void>> {
    return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
  }
}
