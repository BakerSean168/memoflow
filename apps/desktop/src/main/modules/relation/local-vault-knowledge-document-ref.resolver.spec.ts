import { describe, expect, it, vi } from 'vitest';
import { KnowledgeDocumentIdSchema } from '@memoflow/contracts/repository';
import { LocalVaultKnowledgeDocumentRefResolver } from './local-vault-knowledge-document-ref.resolver';

const DOCUMENT_ID = KnowledgeDocumentIdSchema.parse('kdoc_550e8400-e29b-41d4-a716-446655440090');
const SPACE_ID = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440091';

function binding() {
  return {
    binding: { knowledgeSpaceId: SPACE_ID },
    health: { state: 'Available' },
  } as never;
}

describe('LocalVaultKnowledgeDocumentRefResolver', () => {
  it('resolves the same stable document after a path rename/move', async () => {
    const vault = {
      getBinding: vi.fn(async () => binding()),
      scanVault: vi.fn(async () => ({
        notes: [{ relativePath: 'moved/renamed.md', knowledgeDocumentId: DOCUMENT_ID }],
      })),
    };
    const resolver = new LocalVaultKnowledgeDocumentRefResolver(vault as never);
    await expect(resolver.resolve('profile-1', DOCUMENT_ID)).resolves.toEqual({
      knowledgeSpaceId: SPACE_ID,
      documentId: DOCUMENT_ID,
    });
  });

  it('does not resolve unmanaged path-only notes', async () => {
    const vault = {
      getBinding: vi.fn(async () => binding()),
      scanVault: vi.fn(async () => ({
        notes: [{ relativePath: 'notes/unmanaged.md', knowledgeDocumentId: null }],
      })),
    };
    const resolver = new LocalVaultKnowledgeDocumentRefResolver(vault as never);
    await expect(resolver.resolve('profile-1', DOCUMENT_ID)).resolves.toBeNull();
  });
});
