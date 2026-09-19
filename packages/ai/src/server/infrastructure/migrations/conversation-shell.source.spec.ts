import { describe, expect, it, vi } from 'vitest';
import type { IAIConversationRepository } from '../../domain/repositories/i-ai-conversation-repository';
import { ConversationShellSource } from './conversation-shell.source';

function repository(findResult: unknown) {
  return {
    save: vi.fn(),
    findByIdForIdentity: vi.fn().mockResolvedValue(findResult),
    findByIdentityId: vi.fn(),
    delete: vi.fn(),
  } as unknown as IAIConversationRepository;
}

describe('ConversationShellSource', () => {
  it('projects only the owned shell title and never message/runtime state', async () => {
    const conversations = repository({ name: 'Owned conversation', deletedAt: null });
    const source = new ConversationShellSource(conversations);

    await expect(
      source.loadShell({ identityId: 'identity-1', conversationId: 'conversation-1' }),
    ).resolves.toEqual({ title: 'Owned conversation' });
    expect(conversations.findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'conversation-1');
    expect(conversations.save).not.toHaveBeenCalled();
  });

  it('returns null for a missing or deleted product shell', async () => {
    await expect(
      new ConversationShellSource(repository(null)).loadShell({
        identityId: 'identity-1',
        conversationId: 'missing',
      }),
    ).resolves.toBeNull();
    await expect(
      new ConversationShellSource(repository({ name: 'Deleted', deletedAt: new Date() })).loadShell({
        identityId: 'identity-1',
        conversationId: 'deleted',
      }),
    ).resolves.toBeNull();
  });
});
