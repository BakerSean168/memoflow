import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { IAIConversationRepository } from '../../../domain/repositories/i-ai-conversation-repository';
import type { AIConversationClientDTO, UpdateConversationReq } from '@memoflow/contracts/ai';

export class UpdateConversationUseCase {
  constructor(private readonly conversationRepository: IAIConversationRepository) {}

  async execute(
    identityId: string,
    conversationId: string,
    request: UpdateConversationReq,
  ): Promise<Result<AIConversationClientDTO>> {
    const conversation = await this.conversationRepository.findByIdForIdentity(
      identityId,
      conversationId,
    );
    if (!conversation) {
      return error('NOT_FOUND', 'Conversation not found');
    }

    conversation.rename(request.name);
    await this.conversationRepository.save(conversation);
    return ok(conversation.toClientDTO());
  }
}
