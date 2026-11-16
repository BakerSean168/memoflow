import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import type { IAIConversationRepository } from '../../../domain';
import { createAIConversationRepositoryStub, createAIModuleForTests } from '../../../testing';

const OWNER_A = { identityId: 'owner-a' } as ExecutionContext;
const OWNER_B = { identityId: 'owner-b' } as ExecutionContext;

function conversationShell(identityId: string, id: string, name: string) {
  const dto = {
    id,
    identityId,
    name,
    status: 'Active' as const,
    version: 1,
    createdAt: 1_000,
    updatedAt: 2_000,
    deletedAt: null,
  };
  return {
    id,
    identityId,
    name,
    status: 'Active' as const,
    version: 1,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
    deletedAt: null,
    toClientDTO: () => dto,
  };
}

function repositoryWith(shells: readonly { identityId: string; id: string }[]) {
  const all = shells.map((item) => conversationShell(item.identityId, item.id, `T ${item.id}`));
  return createAIConversationRepositoryStub({
    findByIdentityId: (async (identityId: string) =>
      all.filter(
        (item) => item.identityId === identityId,
      )) as IAIConversationRepository['findByIdentityId'],
    findByIdForIdentity: (async (identityId: string, id: string) =>
      all.find((item) => item.identityId === identityId && item.id === id) ??
      null) as IAIConversationRepository['findByIdForIdentity'],
  });
}

describe('assembled assistantConversation port', () => {
  const instance = createAIModuleForTests({
    conversationRepository: repositoryWith([
      { identityId: 'owner-a', id: 'conv-a1' },
      { identityId: 'owner-a', id: 'conv-a2' },
      { identityId: 'owner-b', id: 'conv-b1' },
    ]),
  });

  it('lists only the caller owner conversations', async () => {
    const listed = await instance.assistantConversation.listConversations(OWNER_A);

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.data.total).toBe(2);
    expect(listed.data.data.map((item) => String(item.id)).sort()).toEqual(['conv-a1', 'conv-a2']);

    const other = await instance.assistantConversation.listConversations(OWNER_B);
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    expect(other.data.data.map((item) => String(item.id))).toEqual(['conv-b1']);
  });

  it('reads an owned conversation and hides another owner conversation as NOT_FOUND', async () => {
    const own = await instance.assistantConversation.getConversation('conv-a1', OWNER_A);
    expect(own.ok).toBe(true);
    if (!own.ok) return;
    expect(String(own.data?.id)).toBe('conv-a1');

    const foreign = await instance.assistantConversation.getConversation('conv-b1', OWNER_A);
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.error.code).toBe('NOT_FOUND');

    const missing = await instance.assistantConversation.getConversation('nope', OWNER_A);
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error.code).toBe('NOT_FOUND');
  });
});
