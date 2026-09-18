import { describe, expect, it } from 'vitest';
import { ConversationStatus } from '@memoflow/contracts/ai';
import { AIConversation } from '../ai-conversation';

describe('AIConversation product shell', () => {
  it('creates an active shell without product-owned message state', () => {
    const conversation = AIConversation.create({ identityId: 'identity-1', name: 'Planning' });
    expect(conversation.name).toBe('Planning');
    expect(conversation.status).toBe(ConversationStatus.Active);
    expect(conversation.deletedAt).toBeNull();
    expect(conversation.toClientDTO()).not.toHaveProperty('messages');
    expect(conversation.toClientDTO()).not.toHaveProperty('messageCount');
    expect(conversation.toClientDTO()).not.toHaveProperty('lastMessageAt');
  });

  it('renames and archives the shell while emitting domain events', () => {
    const conversation = AIConversation.create({ identityId: 'identity-1', name: 'Before' });
    expect(conversation.pullDomainEvents().map((event) => event.eventType)).toEqual([
      'ai:conversation-created',
    ]);

    conversation.rename('After');
    conversation.updateStatus(ConversationStatus.Archived);
    expect(conversation.name).toBe('After');
    expect(conversation.status).toBe(ConversationStatus.Archived);
    expect(conversation.pullDomainEvents().map((event) => event.eventType)).toEqual([
      'ai:conversation-updated',
      'ai:conversation-status-changed',
    ]);
  });

  it('soft deletes the shell without creating transcript state', () => {
    const conversation = AIConversation.create({ identityId: 'identity-1', name: 'Disposable' });
    conversation.pullDomainEvents();
    conversation.softDelete();
    expect(conversation.status).toBe(ConversationStatus.Archived);
    expect(conversation.deletedAt).toBeInstanceOf(Date);
    expect(conversation.pullDomainEvents().map((event) => event.eventType)).toEqual([
      'ai:conversation-deleted',
    ]);
  });

  it('round-trips the shell through the client DTO', () => {
    const createdAt = new Date('2026-09-18T00:00:00.000Z');
    const conversation = AIConversation.load({
      id: 'IAiConversationId_550e8400-e29b-41d4-a716-446655440000' as never,
      identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000' as never,
      name: 'Restored',
      status: ConversationStatus.Active,
      version: 3,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    });
    expect(conversation.toClientDTO()).toMatchObject({
      name: 'Restored',
      status: ConversationStatus.Active,
      version: 3,
      createdAt: createdAt.getTime(),
      updatedAt: createdAt.getTime(),
      deletedAt: null,
    });
  });
});
