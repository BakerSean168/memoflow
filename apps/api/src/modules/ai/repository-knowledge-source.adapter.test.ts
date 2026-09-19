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
    commitSha: 'c'.repeat(40),
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
        knowledgeDocumentId: { not: null },
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
        knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440011',
        knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440012',
        sourcePath: 'notes/architecture.md',
        sourceContentHash: 'b'.repeat(64),
        sourceVersion: 'c'.repeat(40),
        title: 'Architecture',
        metadata: expect.objectContaining({
          contentDigest: 'b'.repeat(64),
          knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440012',
          knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440011',
          sourceType: 'github-default-branch-projection',
        }),
      }),
    ]);
  });

  it('hydrates a requested projection through the same identity boundary', async () => {
    const findFirst = vi.fn(async () => projectionRow());
    const db = {
      knowledgeNoteProjection: {
        findMany: vi.fn(),
        findFirst,
      },
    } as unknown as PrismaClient;
    const adapter = new RepositoryKnowledgeSourceAdapter(db);

    const resource = await adapter.getNoteById(
      'identity-1',
      'kdoc_550e8400-e29b-41d4-a716-446655440012',
      'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440011',
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440012',
        deletedAt: null,
        binding: {
          identityId: 'identity-1',
          disconnectedAt: null,
          knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440011',
        },
      },
      include: { binding: { select: { knowledgeSpaceId: true } } },
    });
    expect(resource).toMatchObject({
      sourcePath: 'notes/architecture.md',
      knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440012',
    });
  });

  it('does not expose unmanaged path projections to the durable AI index', async () => {
    const findMany = vi.fn(async () => [projectionRow({ knowledgeDocumentId: null })]);
    const db = {
      knowledgeNoteProjection: { findMany, findFirst: vi.fn() },
    } as unknown as PrismaClient;
    const adapter = new RepositoryKnowledgeSourceAdapter(db);

    await expect(adapter.listIndexableNotes('identity-1', 1)).resolves.toEqual([]);
  });
});
