/**
 * AIConversation Memory Repository
 *
 * In-memory implementation of IAIConversationRepository for testing.
 */

import type { IAIConversationRepository } from '../../../domain';
import type { AIConversation } from '../../../domain/aggregates/ai-conversation';

/**
 * AIConversation Memory Repository
 *
 * In-memory implementation for testing purposes.
 */
export class AIConversationMemoryRepository implements IAIConversationRepository {
  private conversations = new Map<string, AIConversation>();

  async save(conversation: AIConversation): Promise<void> {
    const existing = this.conversations.get(String(conversation.id));
    if (existing && String(existing.identityId) !== String(conversation.identityId)) {
      throw new Error('Conversation not found for the current identity.');
    }
    this.conversations.set(String(conversation.id), conversation);
  }

  async findByIdForIdentity(
    identityId: string,
    id: string,
  ): Promise<AIConversation | null> {
    const conversation = this.conversations.get(id) ?? null;
    if (!conversation || String(conversation.identityId) !== identityId) return null;
    return conversation;
  }

  async findByIdentityId(
    identityId: string,
  ): Promise<AIConversation[]> {
    return Array.from(this.conversations.values()).filter(
      (conversation) => String(conversation.identityId) === identityId,
    );
  }

  async delete(identityId: string, id: string): Promise<void> {
    const conversation = this.conversations.get(id);
    if (!conversation || String(conversation.identityId) !== identityId) {
      throw new Error('Conversation not found for the current identity.');
    }
    this.conversations.delete(id);
  }

  // Test helpers
  clear(): void {
    this.conversations.clear();
  }

  seed(conversations: AIConversation[]): void {
    conversations.forEach((conversation) => this.conversations.set(String(conversation.id), conversation));
  }
}
