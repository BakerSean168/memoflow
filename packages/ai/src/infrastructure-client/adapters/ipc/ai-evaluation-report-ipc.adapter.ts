import { AIChannels } from '@memoflow/contracts/electron';
import type {
  GetAIEvaluationOverviewReq,
  GetAIEvaluationOverviewRes,
} from '@memoflow/ai-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import type { AIEvaluationReportApiClient, IResultIpcClient } from '../types';

/** IPC adapter — returns Result, never throws (residual 98). */
export class AIEvaluationReportIpcAdapter implements AIEvaluationReportApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  async getEvaluationOverview(
    request: GetAIEvaluationOverviewReq = {},
  ): Promise<Result<GetAIEvaluationOverviewRes>> {
    return this.ipcClient.invoke<GetAIEvaluationOverviewRes>(
      AIChannels.EVALUATION_OVERVIEW_GET,
      request,
    );
  }
}
