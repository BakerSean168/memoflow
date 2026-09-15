import { describe, expect, it, vi } from 'vitest';
import { KnowledgeDocumentIdSchema } from '@memoflow/contracts/repository';
import { KnowledgeDocumentWorkspaceResolverService } from './knowledge-document-workspace-resolver.service';

const documentId = KnowledgeDocumentIdSchema.parse('kdoc_550e8400-e29b-41d4-a716-446655440090');
const spaceId = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440091' as never;
const binding = {
  id: 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440092',
  knowledgeSpaceId: spaceId,
  disconnectedAt: null,
} as never;

describe('KnowledgeDocumentWorkspaceResolverService', () => {
  it('resolves one stable document to its current display projection', async () => {
    const service = new KnowledgeDocumentWorkspaceResolverService(
      { findByIdentityId: vi.fn().mockResolvedValue([binding]) },
      { find: vi.fn().mockResolvedValue({ knowledgeDocumentId: documentId }) },
      {
        findLiveByDocumentId: vi.fn().mockResolvedValue([
          {
            title: 'Current title',
            relativePath: 'moved/current.md',
            markdownContent: '  Current   markdown\ncontent ',
            updatedAt: 30,
          },
        ]),
      },
    );

    await expect(service.resolveForWorkspace('identity-1', documentId)).resolves.toEqual({
      knowledgeSpaceId: spaceId,
      title: 'Current title',
      excerpt: 'Current markdown content',
      relativePath: 'moved/current.md',
      updatedAt: 30,
    });
  });

  it('returns null when the durable identity or current projection is missing', async () => {
    const service = new KnowledgeDocumentWorkspaceResolverService(
      { findByIdentityId: vi.fn().mockResolvedValue([binding]) },
      { find: vi.fn().mockResolvedValue(null) },
      { findLiveByDocumentId: vi.fn() },
    );
    await expect(service.resolveForWorkspace('identity-1', documentId)).resolves.toBeNull();
  });

  it('fails closed on ambiguous stable identity across active spaces', async () => {
    const other = {
      ...binding,
      id: 'binding-2',
      knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440099',
    } as never;
    const service = new KnowledgeDocumentWorkspaceResolverService(
      { findByIdentityId: vi.fn().mockResolvedValue([binding, other]) },
      { find: vi.fn().mockResolvedValue({ knowledgeDocumentId: documentId }) },
      { findLiveByDocumentId: vi.fn() },
    );
    await expect(service.resolveForWorkspace('identity-1', documentId)).rejects.toThrow(
      'ambiguous',
    );
  });
});
