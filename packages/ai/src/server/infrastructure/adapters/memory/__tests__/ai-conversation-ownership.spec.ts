import { describe, expect, it } from 'vitest';
import { ConversationStatus } from '@memoflow/ai-contracts';
import { IdentityId } from '@memoflow/utils/domain';
import { AIConversation } from '../../../../domain/aggregates/ai-conversation';
import { AIConversationMemoryRepository } from '../ai-conversation-memory.repository';

describe('AIConversationMemoryRepository ownership', () => {
  it('advances owned activity monotonically without changing the title or reviving a deleted conversation', async () => {
    const repo = new AIConversationMemoryRepository();
    const owned = AIConversation.create({ identityId: 'identity-1', name: 'Preserved title' });
    await repo.save(owned);
    const initial = owned.updatedAt.getTime();
    await repo.recordActivity('foreign', String(owned.id), initial + 1000);
    expect(owned.updatedAt.getTime()).toBe(initial);
    await repo.recordActivity('identity-1', String(owned.id), initial + 1000);
    await repo.recordActivity('identity-1', String(owned.id), initial + 100);
    expect(owned.updatedAt.getTime()).toBe(initial + 1000);
    expect(owned.name).toBe('Preserved title');
    owned.softDelete();
    const deletedAt = owned.updatedAt.getTime();
    await repo.recordActivity('identity-1', String(owned.id), initial + 2000);
    expect(owned.updatedAt.getTime()).toBe(deletedAt);
  });
  it('returns null for foreign identity reads and refuses cross-identity save/delete', async () => {
    const repo = new AIConversationMemoryRepository();
    const owned = AIConversation.create({ identityId: 'identity-1', name: 'owned' });
    await repo.save(owned);

    await expect(repo.findByIdForIdentity('identity-other', String(owned.id))).resolves.toBeNull();
    await expect(repo.findByIdForIdentity('identity-1', String(owned.id))).resolves.toMatchObject({
      name: 'owned',
    });

    const foreign = AIConversation.load({
      id: owned.id,
      identityId: IdentityId.of('identity-other'),
      name: 'takeover',
      status: ConversationStatus.Active,
      messageCount: 0,
      lastMessageAt: null,
      version: owned.version,
      createdAt: owned.createdAt,
      updatedAt: owned.updatedAt,
      deletedAt: null,
      messages: [],
    });

    await expect(repo.save(foreign)).rejects.toThrow(/current identity/);
    await expect(repo.delete('identity-other', String(owned.id))).rejects.toThrow(
      /current identity/,
    );
    await expect(repo.delete('identity-1', String(owned.id))).resolves.toBeUndefined();
    await expect(repo.findByIdForIdentity('identity-1', String(owned.id))).resolves.toBeNull();
  });
});
