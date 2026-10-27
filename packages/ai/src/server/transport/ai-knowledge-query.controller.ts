import { fail, type Result } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import {
  ExpandKnowledgeSchema,
  type ExpandKnowledgeReq,
  type ExpandKnowledgeRes,
  QueryKnowledgeSchema,
  ReindexKnowledgeSchema,
  type QueryKnowledgeReq,
  type QueryKnowledgeRes,
  type ReindexKnowledgeReq,
  type ReindexKnowledgeRes,
} from '@memoflow/ai-contracts';
import { formatZodErrors } from '@memoflow/utils/result';

interface AIKnowledgeQueryControllerService {
  expandKnowledge(
    request: ExpandKnowledgeReq,
    cx: ExecutionContext,
  ): Promise<Result<ExpandKnowledgeRes>>;
  queryKnowledge(
    request: QueryKnowledgeReq,
    cx: ExecutionContext,
  ): Promise<Result<QueryKnowledgeRes>>;
  reindexKnowledge(
    request: ReindexKnowledgeReq,
    cx: ExecutionContext,
  ): Promise<Result<ReindexKnowledgeRes>>;
}

export class AIKnowledgeQueryController {
  constructor(private readonly service: AIKnowledgeQueryControllerService) {}

  async query(input: unknown, cx: ExecutionContext): Promise<Result<QueryKnowledgeRes>> {
    const parsed = QueryKnowledgeSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }

    return this.service.queryKnowledge(parsed.data, cx);
  }

  async expand(input: unknown, cx: ExecutionContext): Promise<Result<ExpandKnowledgeRes>> {
    const parsed = ExpandKnowledgeSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }

    return this.service.expandKnowledge(parsed.data, cx);
  }

  async reindex(input: unknown, cx: ExecutionContext): Promise<Result<ReindexKnowledgeRes>> {
    const parsed = ReindexKnowledgeSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }

    return this.service.reindexKnowledge(parsed.data, cx);
  }
}
