import type { Result } from '@memoflow/transport-contracts/result';
import { ok, error } from '@memoflow/transport-contracts/result';
import type { IAIConversationRepository } from '../../../domain/repositories/i-ai-conversation-repository';
import type { AIConversationClientDTO, UpdateConversationReq } from '@memoflow/ai-contracts';

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
    if (!conversation || conversation.deletedAt) {
      return error('NOT_FOUND', 'Conversation not found');
    }

    if (request.name !== undefined && request.name !== conversation.name)
      conversation.rename(request.name);
    if (request.status !== undefined) conversation.updateStatus(request.status);
    await this.conversationRepository.save(conversation);
    const snapshots = await this.conversationRepository.events?.snapshot(identityId, [
      String(conversation.id),
    ]);
    return ok(snapshots?.[0] ?? conversation.toClientDTO());
  }
}
