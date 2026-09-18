import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import { AIKnowledgeIndexPrismaRepository } from '../ai-knowledge-index-prisma.repository';
import type { KnowledgeIndexedNote } from '../../../../application/ports';

const NOW = new Date('2026-03-27T00:00:00.000Z');
const SPACE_ID = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440011';
const DOC_A = 'kdoc_550e8400-e29b-41d4-a716-446655440012';
const DOC_B = 'kdoc_550e8400-e29b-41d4-a716-446655440013';

function createIndexedNote(overrides: Partial<KnowledgeIndexedNote> = {}): KnowledgeIndexedNote {
  return {
    identityId: 'identity-1',
    repositoryId: 'repo-1',
    knowledgeSpaceId: SPACE_ID,
    knowledgeDocumentId: DOC_A,
    sourcePath: 'docs/alpha.md',
    sourceContentHash: 'hash-1',
    sourceVersion: 'commit-1',
    title: 'Alpha',
    mimeType: 'text/markdown',
    summary: 'Alpha summary',
    keywords: ['alpha'],
    embedding: [0.1, 0.2],
    chunks: [
      {
        chunkIndex: 0,
        content: 'Alpha chunk',
        contentHash: 'chunk-hash-1',
        startOffset: 0,
        endOffset: 11,
        headingPath: ['Alpha'],
        keywords: ['alpha'],
        embedding: [0.3, 0.4],
      },
    ],
    metadata: { source: 'knowledge-test' },
    ...overrides,
  };
}

function indexedRow(note = createIndexedNote()) {
  return {
    id: 'entry-1',
    identityId: note.identityId,
    repositoryId: note.repositoryId,
    knowledgeSpaceId: note.knowledgeSpaceId,
    knowledgeDocumentId: note.knowledgeDocumentId,
    sourcePath: note.sourcePath,
    title: note.title,
    mimeType: note.mimeType,
    sourceContentHash: note.sourceContentHash,
    sourceVersion: note.sourceVersion,
    status: 'indexed',
    summary: note.summary,
    keywords: note.keywords,
    embedding: note.embedding,
    chunks: note.chunks,
    metadata: note.metadata,
    error: null,
    indexedAt: NOW,
    lastRequestedAt: NOW,
  };
}

describe('AIKnowledgeIndexPrismaRepository', () => {
  it('projects stable identity and refreshed source metadata from pgvector rows', async () => {
    const prisma = {
      $queryRaw: vi.fn(async () => [
        indexedRow(createIndexedNote({ sourcePath: 'Archive/alpha.md' })),
      ]),
      aiKnowledgeIndexEntry: { findMany: vi.fn(async () => []) },
    };
    const repository = new AIKnowledgeIndexPrismaRepository(prisma as unknown as PrismaClient);

    await expect(repository.findRelevantNotes('identity-1', 'alpha', 5)).resolves.toEqual([
      expect.objectContaining({
        knowledgeSpaceId: SPACE_ID,
        knowledgeDocumentId: DOC_A,
        sourcePath: 'Archive/alpha.md',
        sourceContentHash: 'hash-1',
      }),
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(prisma.aiKnowledgeIndexEntry.findMany).not.toHaveBeenCalled();
  });

  it('uses the space/document pair for lookup instead of a mutable path', async () => {
    const findMany = vi.fn(async () => [indexedRow()]);
    const prisma = {
      aiKnowledgeIndexEntry: { findMany },
    };
    const repository = new AIKnowledgeIndexPrismaRepository(prisma as unknown as PrismaClient);

    await repository.findByDocumentRefs('identity-1', [
      { knowledgeSpaceId: SPACE_ID, knowledgeDocumentId: DOC_A },
    ]);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        identityId: 'identity-1',
        OR: [{ knowledgeSpaceId: SPACE_ID, knowledgeDocumentId: DOC_A }],
        deletedAt: null,
      },
    });
  });

  it('keeps duplicate paths semantically distinct by stable document identity', async () => {
    const upsert = vi.fn(async () => undefined);
    const prisma = { $executeRaw: vi.fn(async () => 1), aiKnowledgeIndexEntry: { upsert } };
    const repository = new AIKnowledgeIndexPrismaRepository(prisma as unknown as PrismaClient);

    await repository.upsert(createIndexedNote({ knowledgeDocumentId: DOC_A }));
    await repository.upsert(
      createIndexedNote({ knowledgeDocumentId: DOC_B, sourcePath: 'docs/alpha.md' }),
    );

    expect(upsert.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        where: {
          knowledgeSpaceId_knowledgeDocumentId: {
            knowledgeSpaceId: SPACE_ID,
            knowledgeDocumentId: DOC_A,
          },
        },
      }),
    );
    expect(upsert.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        where: {
          knowledgeSpaceId_knowledgeDocumentId: {
            knowledgeSpaceId: SPACE_ID,
            knowledgeDocumentId: DOC_B,
          },
        },
      }),
    );
  });

  it('keeps the same index identity when a document moves and updates its source path', async () => {
    const upsert = vi.fn(async () => undefined);
    const prisma = { $executeRaw: vi.fn(async () => 1), aiKnowledgeIndexEntry: { upsert } };
    const repository = new AIKnowledgeIndexPrismaRepository(prisma as unknown as PrismaClient);

    await repository.upsert(createIndexedNote({ sourcePath: 'docs/before.md' }));
    await repository.upsert(createIndexedNote({ sourcePath: 'archive/after.md' }));

    expect(upsert.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        where: {
          knowledgeSpaceId_knowledgeDocumentId: {
            knowledgeSpaceId: SPACE_ID,
            knowledgeDocumentId: DOC_A,
          },
        },
      }),
    );
    expect(upsert.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        where: {
          knowledgeSpaceId_knowledgeDocumentId: {
            knowledgeSpaceId: SPACE_ID,
            knowledgeDocumentId: DOC_A,
          },
        },
        update: expect.objectContaining({ sourcePath: 'archive/after.md' }),
      }),
    );
  });

  it('deletes the same stable document index without path lookup', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = { $executeRaw: vi.fn(async () => 1), aiKnowledgeIndexEntry: { updateMany } };
    const repository = new AIKnowledgeIndexPrismaRepository(prisma as unknown as PrismaClient);

    await repository.removeByDocumentRef('identity-1', {
      knowledgeSpaceId: SPACE_ID,
      knowledgeDocumentId: DOC_A,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        identityId: 'identity-1',
        knowledgeSpaceId: SPACE_ID,
        knowledgeDocumentId: DOC_A,
        deletedAt: null,
      },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('records failures in the dedicated stable index table only', async () => {
    const upsert = vi.fn(async () => undefined);
    const prisma = { $executeRaw: vi.fn(async () => 1), aiKnowledgeIndexEntry: { upsert } };
    const repository = new AIKnowledgeIndexPrismaRepository(prisma as unknown as PrismaClient);

    await repository.markFailed({
      identityId: 'identity-1',
      repositoryId: 'repo-1',
      knowledgeSpaceId: SPACE_ID,
      knowledgeDocumentId: DOC_A,
      sourcePath: 'docs/alpha.md',
      sourceContentHash: 'hash-1',
      sourceVersion: 'commit-1',
      title: 'Alpha',
      mimeType: 'text/markdown',
      metadata: { source: 'knowledge-test' },
      error: 'embedding timeout',
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          knowledgeSpaceId_knowledgeDocumentId: {
            knowledgeSpaceId: SPACE_ID,
            knowledgeDocumentId: DOC_A,
          },
        },
        update: expect.objectContaining({ status: 'failed', error: 'embedding timeout' }),
      }),
    );
  });
});
