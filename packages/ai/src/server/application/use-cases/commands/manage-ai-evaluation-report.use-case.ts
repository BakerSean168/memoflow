import type { Result } from '@memoflow/transport-contracts/result';
import { ok } from '@memoflow/transport-contracts/result';
import type {
  AIEvaluationOverview,
  GetAIEvaluationOverviewInput,
  IAIEvaluationReportPort,
} from '../../ports';

export class ManageAIEvaluationReportUseCase {
  constructor(private readonly evaluationReportPort: IAIEvaluationReportPort) {}

  async getOverview(
    input: GetAIEvaluationOverviewInput = {},
  ): Promise<Result<AIEvaluationOverview>> {
    const overview = await this.evaluationReportPort.getOverview(input);
    return ok(overview);
  }
}
