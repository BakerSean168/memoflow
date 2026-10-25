import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { IAIConversationRepository } from '../../../domain/repositories/i-ai-conversation-repository';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('DeleteConversationUseCase');

/**
 * 删除对话（软删除）
 */
export class DeleteConversationUseCase {
  constructor(private readonly conversationRepository: IAIConversationRepository) {}

  async execute(identityId: string, conversationId: string): Promise<Result<void>> {
    try {
      const conversation = await this.conversationRepository.findByIdForIdentity(
        identityId,
        conversationId,
      );
      if (!conversation) {
        return error('NOT_FOUND', 'Conversation not found');
      }

      conversation.softDelete();
      await this.conversationRepository.save(conversation);

      logger.info('Conversation deleted', { id: conversationId, identityId });
      return ok(undefined);
    } catch (err) {
      logger.error('Failed to delete conversation', { error: err, conversationId, identityId });
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to delete conversation',
      );
    }
  }
}
