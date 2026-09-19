import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { IAIConversationRepository } from '../../../domain/repositories/i-ai-conversation-repository';
import { AIConversation as AIConversationServer } from '../../../domain/aggregates/ai-conversation';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('GetConversationUseCase');

/**
 * 获取产品拥有的对话 shell；消息历史由 Mastra runtime 提供
 */
export class GetConversationUseCase {
  constructor(private readonly conversationRepository: IAIConversationRepository) {}

  async execute(
    identityId: string,
    conversationId: string,
  ): Promise<Result<AIConversationServer | null>> {
    try {
      const conversation = await this.conversationRepository.findByIdForIdentity(
        identityId,
        conversationId,
      );
      if (!conversation) {
        return ok(null);
      }

      logger.info('Conversation retrieved', { id: conversationId });

      return ok(conversation);
    } catch (err) {
      logger.error('Failed to get conversation', { error: err, conversationId });
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to get conversation');
    }
  }
}
