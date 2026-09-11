import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import { KnowledgeAttachmentContentCachePrismaRepository } from './knowledge-attachment-content-cache-prisma.repository';

function row(overrides: Record<string, unknown> = {}) {
  return {
    bindingId: 'connection-1',
    blobSha: 'blob-1',
    byteSize: 3,
    contentBytes: Uint8Array.from([1, 2, 3]),
    cachedAt: new Date(1_000),
    expiresAt: new Date(10_000),
    ...overrides,
  };
}

describe('KnowledgeAttachmentContentCachePrismaRepository', () => {
  it('returns live bytes and removes expired entries', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ expiresAt: new Date(999) }));
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    const repository = new KnowledgeAttachmentContentCachePrismaRepository({
      knowledgeAttachmentContentCache: { findUnique, deleteMany },
    } as unknown as PrismaClient);

    await expect(repository.find('connection-1', 'blob-1', 2_000)).resolves.toEqual({
      connectionId: 'connection-1',
      blobSha: 'blob-1',
      byteSize: 3,
      bytes: Uint8Array.from([1, 2, 3]),
      cachedAt: 1_000,
      expiresAt: 10_000,
    });
    await expect(repository.find('connection-1', 'blob-1', 2_000)).resolves.toBeNull();
    expect(deleteMany).toHaveBeenCalledWith({
      where: { bindingId: 'connection-1', blobSha: 'blob-1' },
    });
  });

  it('upserts bytes under the binding/blob composite key and prunes expired rows', async () => {
    const upsert = vi.fn(async () => row());
    const deleteMany = vi.fn(async () => ({ count: 2 }));
    const repository = new KnowledgeAttachmentContentCachePrismaRepository({
      knowledgeAttachmentContentCache: { upsert, deleteMany },
    } as unknown as PrismaClient);

    await repository.save({
      connectionId: 'connection-1',
      blobSha: 'blob-1',
      byteSize: 3,
      bytes: Uint8Array.from([1, 2, 3]),
      cachedAt: 2_000,
      expiresAt: 10_000,
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { bindingId_blobSha: { bindingId: 'connection-1', blobSha: 'blob-1' } },
      create: expect.objectContaining({
        bindingId: 'connection-1',
        blobSha: 'blob-1',
        byteSize: 3,
        contentBytes: Buffer.from([1, 2, 3]),
        cachedAt: new Date(2_000),
        expiresAt: new Date(10_000),
      }),
      update: expect.objectContaining({
        byteSize: 3,
        contentBytes: Buffer.from([1, 2, 3]),
        cachedAt: new Date(2_000),
        expiresAt: new Date(10_000),
      }),
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: new Date(2_000) } },
    });
  });
});
