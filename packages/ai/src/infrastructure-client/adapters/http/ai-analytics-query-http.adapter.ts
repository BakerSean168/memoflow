import type { AIAnalyticsQueryApiClient, IResultHttpClient } from '../types';
import type { QueryAnalyticsReq, QueryAnalyticsRes } from '@memoflow/contracts/ai';
import type { Result } from '@memoflow/transport-contracts/result';

/** HTTP adapter — returns Result, never throws (residual 98). */
export class AIAnalyticsQueryHttpAdapter implements AIAnalyticsQueryApiClient {
  constructor(private readonly httpClient: IResultHttpClient) {}

  async queryAnalytics(request: QueryAnalyticsReq): Promise<Result<QueryAnalyticsRes>> {
    return this.httpClient.post<QueryAnalyticsRes>('/ai/analytics/query', request);
  }
}
