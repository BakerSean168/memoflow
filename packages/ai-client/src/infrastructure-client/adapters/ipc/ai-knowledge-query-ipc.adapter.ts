import type { AIKnowledgeQueryApiClient, IResultIpcClient } from '../types';
import { AIChannels } from '@memoflow/desktop-contracts';
import type {
  ExpandKnowledgeReq,
  ExpandKnowledgeRes,
  QueryKnowledgeReq,
  QueryKnowledgeRes,
  ReindexKnowledgeReq,
  ReindexKnowledgeRes,
} from '@memoflow/ai-contracts';
import type { Result } from '@memoflow/transport-contracts/result';

/** IPC adapter — returns Result, never throws (residual 98). */
export class AIKnowledgeQueryIpcAdapter implements AIKnowledgeQueryApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async expandKnowledge(request: ExpandKnowledgeReq): Promise<Result<ExpandKnowledgeRes>> {
    return this.ipcClient.invoke<ExpandKnowledgeRes>(AIChannels.KNOWLEDGE_EXPAND, request);
  }

  async queryKnowledge(request: QueryKnowledgeReq): Promise<Result<QueryKnowledgeRes>> {
    return this.ipcClient.invoke<QueryKnowledgeRes>(AIChannels.KNOWLEDGE_QUERY, request);
  }

  async reindexKnowledge(request: ReindexKnowledgeReq): Promise<Result<ReindexKnowledgeRes>> {
    return this.ipcClient.invoke<ReindexKnowledgeRes>(AIChannels.KNOWLEDGE_REINDEX, request);
  }
}
