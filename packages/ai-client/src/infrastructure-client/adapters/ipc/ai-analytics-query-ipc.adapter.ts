import type { AIAnalyticsQueryApiClient, IResultIpcClient } from '../types';
import { AIChannels } from '@memoflow/desktop-contracts';
import type { QueryAnalyticsReq, QueryAnalyticsRes } from '@memoflow/ai-contracts';
import type { Result } from '@memoflow/transport-contracts/result';

/** IPC adapter — returns Result, never throws (residual 98). */
export class AIAnalyticsQueryIpcAdapter implements AIAnalyticsQueryApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async queryAnalytics(request: QueryAnalyticsReq): Promise<Result<QueryAnalyticsRes>> {
    return this.ipcClient.invoke<QueryAnalyticsRes>(AIChannels.ANALYTICS_QUERY, request);
  }
}
