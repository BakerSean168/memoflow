import { fail, type Result } from '@memoflow/transport-contracts/result';
import {
  GetAIEvaluationOverviewSchema,
  type GetAIEvaluationOverviewReq,
  type GetAIEvaluationOverviewRes,
} from '@memoflow/ai-contracts';
import { formatZodErrors } from '@memoflow/utils/result';

interface AIEvaluationReportControllerService {
  getEvaluationOverview(
    request?: GetAIEvaluationOverviewReq,
  ): Promise<Result<GetAIEvaluationOverviewRes>>;
}

export class AIEvaluationReportController {
  constructor(private readonly service: AIEvaluationReportControllerService) {}

  async overview(input: unknown): Promise<Result<GetAIEvaluationOverviewRes>> {
    const parsed = GetAIEvaluationOverviewSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }

    return this.service.getEvaluationOverview(parsed.data);
  }
}
