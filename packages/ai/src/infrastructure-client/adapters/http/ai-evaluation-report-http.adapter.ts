import type { AIEvaluationReportApiClient, IResultHttpClient } from '../types';
import type {
  GetAIEvaluationOverviewReq,
  GetAIEvaluationOverviewRes,
} from '@memoflow/contracts/ai';
import type { Result } from '@memoflow/transport-contracts/result';

/** HTTP adapter — returns Result, never throws (residual 98). */
export class AIEvaluationReportHttpAdapter implements AIEvaluationReportApiClient {
  constructor(private readonly httpClient: IResultHttpClient) {}

  async getEvaluationOverview(
    request: GetAIEvaluationOverviewReq = {},
  ): Promise<Result<GetAIEvaluationOverviewRes>> {
    const params = new URLSearchParams();
    if (typeof request.historyLimit === 'number') {
      params.set('historyLimit', String(request.historyLimit));
    }

    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return this.httpClient.get<GetAIEvaluationOverviewRes>(`/ai/evaluations/overview${suffix}`);
  }
}
