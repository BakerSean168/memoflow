import { fail, type Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import {
  QueryAnalyticsSchema,
  type QueryAnalyticsReq,
  type QueryAnalyticsRes,
} from '@memoflow/contracts/ai';
import { formatZodErrors } from '@memoflow/utils/result';

interface AIAnalyticsQueryControllerService {
  queryAnalytics(
    request: QueryAnalyticsReq,
    cx: ExecutionContext,
  ): Promise<Result<QueryAnalyticsRes>>;
}

export class AIAnalyticsQueryController {
  constructor(private readonly service: AIAnalyticsQueryControllerService) {}

  async query(input: unknown, cx: ExecutionContext): Promise<Result<QueryAnalyticsRes>> {
    const parsed = QueryAnalyticsSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }

    return this.service.queryAnalytics(parsed.data, cx);
  }
}
