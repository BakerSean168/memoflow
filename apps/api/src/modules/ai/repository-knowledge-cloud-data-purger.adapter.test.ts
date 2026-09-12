import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import { RepositoryKnowledgeCloudDataPurgerAdapter } from './repository-knowledge-cloud-data-purger.adapter';

describe('RepositoryKnowledgeCloudDataPurgerAdapter', () => {
  it('revalidates ownership and deletes the AI index before the cascading remote binding row', async () => {
    const tx = {
      knowledgeRemoteBinding: {
        findFirst: vi.fn(async () => ({ id: 'connection-1' })),
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
      aiKnowledgeIndexEntry: {
        deleteMany: vi.fn(async () => ({ count: 2 })),
      },
    };
    const db = {
      $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<boolean>) => callback(tx)),
    } as unknown as PrismaClient;
    const adapter = new RepositoryKnowledgeCloudDataPurgerAdapter(db);

    await expect(adapter.purge('identity-1', 'connection-1')).resolves.toBe(true);
    expect(tx.knowledgeRemoteBinding.findFirst).toHaveBeenCalledWith({
      where: { id: 'connection-1', identityId: 'identity-1', disconnectedAt: null },
      select: { id: true },
    });
    expect(tx.aiKnowledgeIndexEntry.deleteMany).toHaveBeenCalledWith({
      where: { identityId: 'identity-1', repositoryId: 'connection-1' },
    });
    expect(tx.knowledgeRemoteBinding.deleteMany).toHaveBeenCalledWith({
      where: { id: 'connection-1', identityId: 'identity-1' },
    });
    expect(tx.aiKnowledgeIndexEntry.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.knowledgeRemoteBinding.deleteMany.mock.invocationCallOrder[0],
    );
  });

  it('does not mutate either table when the identity-scoped connection is absent', async () => {
    const tx = {
      knowledgeRemoteBinding: {
        findFirst: vi.fn(async () => null),
        deleteMany: vi.fn(),
      },
      aiKnowledgeIndexEntry: { deleteMany: vi.fn() },
    };
    const db = {
      $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<boolean>) => callback(tx)),
    } as unknown as PrismaClient;

    await expect(
      new RepositoryKnowledgeCloudDataPurgerAdapter(db).purge('identity-2', 'connection-1'),
    ).resolves.toBe(false);
    expect(tx.aiKnowledgeIndexEntry.deleteMany).not.toHaveBeenCalled();
    expect(tx.knowledgeRemoteBinding.deleteMany).not.toHaveBeenCalled();
  });
});
