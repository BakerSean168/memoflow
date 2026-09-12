import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import { RepositoryKnowledgeSourceAdapter } from './repository-knowledge-source.adapter';

function projectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'projection-1',
    bindingId: 'binding-1',
    knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440012',
    binding: { knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440011' },
    relativePath: 'notes/architecture.md',
    markdownContent: '# Architecture\n\nRepository-backed knowledge.',
    frontmatter: { title: 'Architecture' },
    blobSha: 'a'.repeat(40),
    contentHash: 'b'.repeat(64),
    indexStatus: 'pending',
    ...overrides,
  };
}

describe('RepositoryKnowledgeSourceAdapter', () => {
  it('loads only identity-owned connected projections and exposes the source digest for indexing', async () => {
    const findMany = vi.fn(async () => [
      projectionRow({
        id: 'projection-unrelated',
        relativePath: 'notes/unrelated.md',
        frontmatter: {},
        markdownContent: '# Other topic',
      }),
      projectionRow(),
    ]);
    const db = {
      knowledgeNoteProjection: {
        findMany,
        findFirst: vi.fn(),
      },
    } as unknown as PrismaClient;
    const adapter = new RepositoryKnowledgeSourceAdapter(db);

    const resources = await adapter.listRelevantNotes('identity-1', 'architecture', 1);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        binding: { identityId: 'identity-1', disconnectedAt: null },
      },
      include: { binding: { select: { knowledgeSpaceId: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 3,
    });
    expect(resources).toEqual([
      expect.objectContaining({
        identityId: 'identity-1',
        repositoryId: 'binding-1',
        resourceId: 'kdoc_550e8400-e29b-41d4-a716-446655440012',
        resourcePath: 'notes/architecture.md',
        title: 'Architecture',
        metadata: expect.objectContaining({
          contentDigest: 'b'.repeat(64),
          knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440012',
          knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440011',
          projectionIndexStatus: 'pending',
          sourceType: 'github-default-branch-projection',
        }),
      }),
    ]);
  });

  it('hydrates a requested projection through the same identity boundary', async () => {
    const findFirst = vi.fn(async () => projectionRow({ indexStatus: 'indexed' }));
    const db = {
      knowledgeNoteProjection: {
        findMany: vi.fn(),
        findFirst,
      },
    } as unknown as PrismaClient;
    const adapter = new RepositoryKnowledgeSourceAdapter(db);

    const resource = await adapter.getNoteById('identity-1', 'projection-1');

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ id: 'projection-1' }, { knowledgeDocumentId: 'projection-1' }],
        deletedAt: null,
        binding: { identityId: 'identity-1', disconnectedAt: null },
      },
      include: { binding: { select: { knowledgeSpaceId: true } } },
    });
    expect(resource?.metadata).toMatchObject({
      projectionIndexStatus: 'indexed',
      knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440012',
      knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440011',
    });
  });

  it('keeps unmanaged path projections readable but without a stable document identity', async () => {
    const findMany = vi.fn(async () => [projectionRow({ knowledgeDocumentId: null })]);
    const db = {
      knowledgeNoteProjection: { findMany, findFirst: vi.fn() },
    } as unknown as PrismaClient;
    const adapter = new RepositoryKnowledgeSourceAdapter(db);

    const [resource] = await adapter.listIndexableNotes('identity-1', 1);

    expect(resource?.resourceId).toBe('projection-1');
    expect(resource?.metadata).toMatchObject({
      knowledgeDocumentId: null,
      knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440011',
    });
  });
});
