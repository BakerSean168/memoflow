import { fail, ok, type Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import {
  ConversationNameSchema,
  type CreateConversationRes,
  type ConversationListRes,
  type GetConversationRes,
  type UpdateConversationReq,
  type UpdateConversationRes,
} from '@memoflow/contracts/ai';
import { formatZodErrors } from '@memoflow/utils/result';

interface AIConversationControllerService {
  createConversation(cx: ExecutionContext, name?: string): Promise<Result<CreateConversationRes>>;
  listConversations(
    cx: ExecutionContext,
    page?: number,
    pageSize?: number,
  ): Promise<Result<ConversationListRes>>;
  getConversation(
    id: string,
    cx: ExecutionContext,
  ): Promise<Result<GetConversationRes | null>>;
  updateConversation(
    id: string,
    input: UpdateConversationReq,
    cx: ExecutionContext,
  ): Promise<Result<UpdateConversationRes>>;
  deleteConversation(id: string, cx: ExecutionContext): Promise<Result<void>>;
}

/**
 * Product conversation-shell controller.
 *
 * Message execution/history is intentionally absent: Mastra runtime endpoints
 * are authoritative for Assistant messages after AI-VNEXT-03.
 */
export class AIChatController {
  constructor(private readonly conversationService: AIConversationControllerService) {}

  async createConversation(
    input: unknown,
    cx: ExecutionContext,
  ): Promise<Result<CreateConversationRes>> {
    const parsed = ConversationNameSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.conversationService.createConversation(cx, parsed.data.name);
  }

  async listConversations(
    cx: ExecutionContext,
    page = 1,
    pageSize = 20,
  ): Promise<Result<ConversationListRes>> {
    return this.conversationService.listConversations(cx, page, pageSize);
  }

  async getConversation(id: string, cx: ExecutionContext): Promise<Result<GetConversationRes>> {
    const result = await this.conversationService.getConversation(id, cx);
    if (!result.ok) return result;
    if (!result.data) return fail({ code: 'NOT_FOUND', message: 'Conversation not found' });
    return ok(result.data);
  }

  async updateConversation(
    id: string,
    input: unknown,
    cx: ExecutionContext,
  ): Promise<Result<UpdateConversationRes>> {
    const parsed = ConversationNameSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return this.conversationService.updateConversation(id, parsed.data, cx);
  }

  async deleteConversation(id: string, cx: ExecutionContext): Promise<Result<null>> {
    const result = await this.conversationService.deleteConversation(id, cx);
    if (!result.ok) return result;
    return ok(null);
  }
}
