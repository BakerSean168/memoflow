import type { Result } from '@memoflow/transport-contracts/result';
import { ok, error } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { IAIConversationRepository } from '../../../domain/repositories/i-ai-conversation-repository';
import { AIConversation as AIConversationServer } from '../../../domain/aggregates/ai-conversation';
import type { AIConversationClientDTO } from '@memoflow/contracts/ai';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('CreateConversationUseCase');

/**
 * 创建新对话
 */
export class CreateConversationUseCase {
  constructor(private readonly conversationRepository: IAIConversationRepository) {}

  async execute(cx: ExecutionContext, title?: string): Promise<Result<AIConversationClientDTO>> {
    try {
      const conversation = AIConversationServer.create({
        identityId: cx.identityId,
        name: title ?? 'New Chat',
      });

      await this.conversationRepository.save(conversation);

      logger.info('Conversation created', {
        id: conversation.id,
        identityId: cx.identityId,
        name: conversation.name,
      });

      const snapshots = await this.conversationRepository.events?.snapshot(cx.identityId, [
        String(conversation.id),
      ]);
      return ok(snapshots?.[0] ?? conversation.toClientDTO());
    } catch (err) {
      logger.error('Failed to create conversation', {
        error: err,
        identityId: cx.identityId,
        title,
      });
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to create conversation',
      );
    }
  }
}
