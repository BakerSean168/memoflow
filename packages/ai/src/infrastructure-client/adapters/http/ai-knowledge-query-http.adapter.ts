import type { AIKnowledgeQueryApiClient, IResultHttpClient } from '../types';
import type {
  ExpandKnowledgeReq,
  ExpandKnowledgeRes,
  QueryKnowledgeReq,
  QueryKnowledgeRes,
  ReindexKnowledgeReq,
  ReindexKnowledgeRes,
} from '@memoflow/contracts/ai';
import type { Result } from '@memoflow/transport-contracts/result';

/** HTTP adapter — returns Result, never throws (residual 98). */
export class AIKnowledgeQueryHttpAdapter implements AIKnowledgeQueryApiClient {
  constructor(private readonly httpClient: IResultHttpClient) {}

  async expandKnowledge(request: ExpandKnowledgeReq): Promise<Result<ExpandKnowledgeRes>> {
    return this.httpClient.post<ExpandKnowledgeRes>('/ai/knowledge/expand', request);
  }

  async queryKnowledge(request: QueryKnowledgeReq): Promise<Result<QueryKnowledgeRes>> {
    return this.httpClient.post<QueryKnowledgeRes>('/ai/knowledge/query', request);
  }

  async reindexKnowledge(request: ReindexKnowledgeReq): Promise<Result<ReindexKnowledgeRes>> {
    return this.httpClient.post<ReindexKnowledgeRes>('/ai/knowledge/reindex', request);
  }
}
