import { describe, expect, it, vi } from 'vitest';
import { KnowledgeDocumentIdSchema } from '@memoflow/contracts/repository';
import { KnowledgeDocumentRefResolverService } from './knowledge-document-ref-resolver.service';

const DOCUMENT_ID = KnowledgeDocumentIdSchema.parse('kdoc_550e8400-e29b-41d4-a716-446655440090');
const SPACE_1 = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440091' as never;
const SPACE_2 = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440092' as never;

function binding(knowledgeSpaceId: typeof SPACE_1, disconnectedAt: number | null = null) {
  return {
    id: 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440001',
    knowledgeSpaceId,
    identityId: 'identity-1',
    provider: 'github',
    installationId: 'installation-1',
    repositoryId: 'repo-1',
    repositoryFullNameSnapshot: 'owner/repo',
    connectedAt: 1,
    disconnectedAt,
    version: 1,
  } as never;
}

describe('KnowledgeDocumentRefResolverService', () => {
  it('resolves only a stable identity in an active binding owned by the current identity', async () => {
    const bindings = {
      findByIdentityId: vi.fn(async () => [binding(SPACE_1), binding(SPACE_2, 2)]),
    };
    const identities = {
      find: vi.fn(async (spaceId) =>
        spaceId === SPACE_1
          ? {
              knowledgeSpaceId: SPACE_1,
              knowledgeDocumentId: DOCUMENT_ID,
              origin: 'ObservedMarker',
              originRequestId: null,
              createdAt: 1,
              updatedAt: 1,
            }
          : null,
      ),
    };
    const resolver = new KnowledgeDocumentRefResolverService(
      bindings as never,
      identities as never,
    );
    await expect(resolver.resolve('identity-1', DOCUMENT_ID)).resolves.toEqual({
      knowledgeSpaceId: SPACE_1,
      documentId: DOCUMENT_ID,
    });
    expect(identities.find).toHaveBeenCalledTimes(1);
  });

  it('returns null when no active identity-owned space contains the stable document', async () => {
    const resolver = new KnowledgeDocumentRefResolverService(
      { findByIdentityId: vi.fn(async () => []) } as never,
      { find: vi.fn() } as never,
    );
    await expect(resolver.resolve('identity-1', DOCUMENT_ID)).resolves.toBeNull();
  });

  it('fails closed when the same kdoc identity is live in multiple active spaces', async () => {
    const bindings = { findByIdentityId: vi.fn(async () => [binding(SPACE_1), binding(SPACE_2)]) };
    const identities = {
      find: vi.fn(async (spaceId) => ({
        knowledgeSpaceId: spaceId,
        knowledgeDocumentId: DOCUMENT_ID,
        origin: 'ObservedMarker',
        originRequestId: null,
        createdAt: 1,
        updatedAt: 1,
      })),
    };
    const resolver = new KnowledgeDocumentRefResolverService(
      bindings as never,
      identities as never,
    );
    await expect(resolver.resolve('identity-1', DOCUMENT_ID)).rejects.toThrow('ambiguous');
  });
});
