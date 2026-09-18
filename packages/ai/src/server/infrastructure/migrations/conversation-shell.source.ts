import type { IAIConversationRepository } from '../../domain/repositories/i-ai-conversation-repository';
import type {
  AssistantConversationShellSnapshot,
  AssistantConversationShellSource,
} from '../../mastra/runtime';

/**
 * Validates product-shell ownership before a Mastra thread is opened.
 * No transcript or runtime state is projected through this seam.
 */
export class ConversationShellSource implements AssistantConversationShellSource {
  constructor(private readonly conversations: IAIConversationRepository) {}

  async loadShell(input: {
    identityId: string;
    conversationId: string;
  }): Promise<AssistantConversationShellSnapshot | null> {
    const conversation = await this.conversations.findByIdForIdentity(
      input.identityId,
      input.conversationId,
    );
    if (!conversation || conversation.deletedAt) return null;
    return { title: conversation.name };
  }
}
