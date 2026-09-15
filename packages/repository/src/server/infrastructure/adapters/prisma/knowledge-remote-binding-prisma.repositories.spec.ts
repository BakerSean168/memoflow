import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { KnowledgeRemoteBindingServerDTO } from '@memoflow/contracts/repository';
import { KnowledgeRemoteBindingPrismaRepository } from './knowledge-remote-binding-prisma.repositories';

const BINDING_ID = 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440300' as never;
const SPACE_ID = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440301' as never;

function binding(
  overrides: Partial<KnowledgeRemoteBindingServerDTO> = {},
): KnowledgeRemoteBindingServerDTO {
  return {
    id: BINDING_ID,
    knowledgeSpaceId: SPACE_ID,
    identityId: 'identity-1' as never,
    provider: 'GitHub',
    installationId: 'installation-1',
    repositoryId: 'repository-1',
    repositoryFullNameSnapshot: 'acme/notes',
    connectedAt: 1_750_000_000_000,
    disconnectedAt: null,
    version: 1,
    ...overrides,
  };
}

describe('KnowledgeRemoteBindingPrismaRepository', () => {
  it('pages projection candidates by stable connected-at and id ordering', async () => {
    const findMany = vi.fn(async () => []);
    const repository = new KnowledgeRemoteBindingPrismaRepository({
      knowledgeRemoteBinding: { findMany },
    } as unknown as PrismaClient);
    const connectedAt = Date.parse('2026-07-19T18:00:00.000Z');

    await repository.listProjectionCandidates(50, { connectedAt, id: 'binding-50' });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        disconnectedAt: null,
        OR: [
          { connectedAt: { gt: new Date(connectedAt) } },
          { connectedAt: new Date(connectedAt), id: { gt: 'binding-50' } },
        ],
      },
      orderBy: [{ connectedAt: 'asc' }, { id: 'asc' }],
      take: 50,
    });
  });

  it('creates a new binding with no mixed provider/cursor fields', async () => {
    const findUnique = vi.fn(async () => null);
    const create = vi.fn(async () => undefined);
    const repository = new KnowledgeRemoteBindingPrismaRepository({
      knowledgeRemoteBinding: { findUnique, create },
    } as unknown as PrismaClient);

    await repository.save(binding());

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: BINDING_ID,
        knowledgeSpaceId: SPACE_ID,
        identityId: 'identity-1',
        repositoryId: 'repository-1',
        disconnectedAt: null,
      }),
    });
    expect(create.mock.calls[0]?.[0]?.data).not.toHaveProperty('status');
    expect(create.mock.calls[0]?.[0]?.data).not.toHaveProperty('lastSyncedCommitSha');
  });

  it('updates only by id + identity and never rewrites identityId', async () => {
    const findUnique = vi.fn(async () => ({ identityId: 'identity-1' }));
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const repository = new KnowledgeRemoteBindingPrismaRepository({
      knowledgeRemoteBinding: { findUnique, updateMany },
    } as unknown as PrismaClient);

    await repository.save(binding({ repositoryFullNameSnapshot: 'acme/renamed', version: 2 }));

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: BINDING_ID, identityId: 'identity-1' } }),
    );
    expect(updateMany.mock.calls[0]?.[0]?.data).not.toHaveProperty('identityId');
  });

  it('refuses ownership reassignment', async () => {
    const findUnique = vi.fn(async () => ({ identityId: 'identity-1' }));
    const updateMany = vi.fn();
    const repository = new KnowledgeRemoteBindingPrismaRepository({
      knowledgeRemoteBinding: { findUnique, updateMany },
    } as unknown as PrismaClient);

    await expect(
      repository.save(binding({ identityId: 'identity-other' as never })),
    ).rejects.toThrow(/current identity/);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('disconnects only the active binding owned by the identity', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const repository = new KnowledgeRemoteBindingPrismaRepository({
      knowledgeRemoteBinding: { updateMany },
    } as unknown as PrismaClient);

    await expect(
      repository.markDisconnected('identity-1', BINDING_ID, 1_750_000_001_000),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: BINDING_ID, identityId: 'identity-1', disconnectedAt: null },
      data: { disconnectedAt: new Date(1_750_000_001_000), version: { increment: 1 } },
    });
  });
});
