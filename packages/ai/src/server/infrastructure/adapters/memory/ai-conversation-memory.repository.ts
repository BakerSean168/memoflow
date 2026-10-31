/**
 * AIConversation Memory Repository
 *
 * In-memory implementation of IAIConversationRepository for testing.
 */

import type { IAIConversationRepository } from '../../../domain';
import { AIConversation } from '../../../domain/aggregates/ai-conversation';

/**
 * AIConversation Memory Repository
 *
 * In-memory implementation for testing purposes.
 */
export class AIConversationMemoryRepository implements IAIConversationRepository {
  private conversations = new Map<string, AIConversation>();

  async saveStatus(conversation: AIConversation): Promise<boolean> {
    const current = this.conversations.get(String(conversation.id));
    if (
      !current ||
      current.deletedAt ||
      String(current.identityId) !== String(conversation.identityId)
    )
      return false;
    current.updateStatus(conversation.status);
    return true;
  }
  async saveTitle(conversation: AIConversation, expectedVersion: number): Promise<boolean> {
    const current = this.conversations.get(String(conversation.id));
    if (
      !current ||
      current.deletedAt ||
      current.version !== expectedVersion ||
      String(current.identityId) !== String(conversation.identityId)
    )
      return false;
    this.conversations.set(String(conversation.id), conversation);
    return true;
  }

  async save(conversation: AIConversation): Promise<void> {
    const existing = this.conversations.get(String(conversation.id));
    if (existing && String(existing.identityId) !== String(conversation.identityId)) {
      throw new Error('Conversation not found for the current identity.');
    }
    this.conversations.set(String(conversation.id), conversation);
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<AIConversation | null> {
    const conversation = this.conversations.get(id) ?? null;
    if (!conversation || String(conversation.identityId) !== identityId) return null;
    return AIConversation.load({
      ...conversation.toServerDTO(),
      id: conversation.id,
      identityId: conversation.identityId,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      deletedAt: conversation.deletedAt,
    });
  }

  async findByIdentityId(identityId: string): Promise<AIConversation[]> {
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
  async recordActivity(identityId: string, id: string, at: number): Promise<void> {
    const conversation = this.conversations.get(id);
    if (conversation && String(conversation.identityId) === identityId)
      conversation.recordActivity(at);
  }

  clear(): void {
    this.conversations.clear();
  }

  seed(conversations: AIConversation[]): void {
    conversations.forEach((conversation) =>
      this.conversations.set(String(conversation.id), conversation),
    );
  }
}
