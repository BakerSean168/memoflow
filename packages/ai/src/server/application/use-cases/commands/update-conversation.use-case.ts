import type { Result } from '@memoflow/transport-contracts/result';
import { ok, error } from '@memoflow/transport-contracts/result';
import type { IAIConversationRepository } from '../../../domain/repositories/i-ai-conversation-repository';
import {
  fallbackConversationTitle,
  sanitizeConversationTitle,
  type AIConversationClientDTO,
  type UpdateConversationReq,
  type ConversationTitleGeneration,
} from '@memoflow/ai-contracts';

export class UpdateConversationUseCase {
  private readonly generating = new Set<string>();
  constructor(
    private readonly conversationRepository: IAIConversationRepository,
    private readonly generateTitle?: (
      identityId: string,
      input: ConversationTitleGeneration,
    ) => Promise<string>,
  ) {}

  async execute(
    identityId: string,
    conversationId: string,
    request: UpdateConversationReq,
  ): Promise<Result<AIConversationClientDTO>> {
    let conversation = await this.conversationRepository.findByIdForIdentity(
      identityId,
      conversationId,
    );
    if (!conversation || conversation.deletedAt)
      return error('NOT_FOUND', 'Conversation not found');
    let expectedVersion = request.expectedVersion ?? conversation.version;
    const generation = request.generateTitle;
    const explicitTitle = request.name !== undefined || generation?.automatic === false;
    if (explicitTitle && expectedVersion === 1 && conversation.version === 2) expectedVersion = 2;
    if (
      expectedVersion !== conversation.version ||
      (generation?.automatic && conversation.version !== 1)
    )
      return error('CONFLICT', 'Conversation title has changed. Refresh before retrying.');
    if (generation && (request.name !== undefined || request.status !== undefined))
      return error('VALIDATION_ERROR', 'Title generation must be a separate update');
    if (generation && this.generating.has(`${identityId}:${conversationId}`))
      return error('CONFLICT', 'Title generation already in progress');
    const key = `${identityId}:${conversationId}`;
    if (generation) this.generating.add(key);
    try {
      let name = request.name;
      let titleGenerationOutcome: 'model' | 'fallback' | undefined;
      if (generation) {
        try {
          // Never choose another provider/model on behalf of the user, or retry inference.
          name =
            generation.providerId && generation.modelId && this.generateTitle
              ? sanitizeConversationTitle(await this.generateTitle(identityId, generation))
              : '';
        } catch {
          name = '';
        }
        titleGenerationOutcome = name ? 'model' : 'fallback';
        name ||= fallbackConversationTitle(generation.content);
      }
      if (name !== undefined) {
        if (request.status !== undefined)
          return error('VALIDATION_ERROR', 'Rename and status must be separate updates');
        const title = sanitizeConversationTitle(name);
        if (!title) return error('VALIDATION_ERROR', 'Conversation name cannot be empty');
        conversation.rename(title, generation?.automatic);
        if (!(await this.conversationRepository.saveTitle(conversation, expectedVersion))) {
          // A first automatic title may have committed while this explicit edit was in flight.
          // Retry that one transition only; never retry over another user's explicit edit.
          const latest = await this.conversationRepository.findByIdForIdentity(
            identityId,
            conversationId,
          );
          if (!explicitTitle || expectedVersion !== 1 || !latest || latest.version !== 2)
            return error('CONFLICT', 'Conversation title has changed. Refresh before retrying.');
          latest.rename(title);
          if (!(await this.conversationRepository.saveTitle(latest, 2)))
            return error('CONFLICT', 'Conversation title has changed. Refresh before retrying.');
          conversation = latest;
        }
      } else {
        if (request.status !== undefined) conversation.updateStatus(request.status);
        if (!(await this.conversationRepository.saveStatus(conversation)))
          return error('CONFLICT', 'Conversation changed. Refresh before retrying.');
      }
      const snapshots = await this.conversationRepository.events?.snapshot(identityId, [
        String(conversation.id),
      ]);
      const current = await this.conversationRepository.findByIdForIdentity(
        identityId,
        conversationId,
      );
      return ok({
        ...(snapshots?.[0] ?? current?.toClientDTO() ?? conversation.toClientDTO()),
        ...(titleGenerationOutcome ? { titleGenerationOutcome } : {}),
      });
    } finally {
      if (generation) this.generating.delete(key);
    }
  }
}
