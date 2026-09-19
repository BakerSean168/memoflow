import { describe, expect, it, vi } from 'vitest';
import type { LocalVaultElectronPort } from '@memoflow/repository/electron';
import { DesktopKnowledgeNotePersistenceAdapter } from '../desktop-knowledge-note-persistence.adapter';

function createLocalVaultPort(): LocalVaultElectronPort {
  return {
    getBinding: vi.fn(),
    selectVault: vi.fn(),
    detachVault: vi.fn(),
    scanVault: vi.fn(),
    readNote: vi.fn(),
    searchVault: vi.fn(),
    openInObsidian: vi.fn(),
    writeConfirmedNote: vi.fn(async () => ({
      created: true,
      note: {
        relativePath: 'Research/Approved.md',
        knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440520' as never,
        title: 'Approved',
        excerpt: 'Reviewed body',
        tags: ['agent'],
        outgoingLinks: ['Source'],
        size: 31,
        updatedAt: 1_750_000_000_000 as never,
        contentMarkdown: '# Approved\n\nReviewed body',
        frontmatter: { status: 'reviewed' },
      },
    })),
    inspectSyncContent: vi.fn(async () => 'NonEmpty'),
  };
}

describe('DesktopKnowledgeNotePersistenceAdapter', () => {
  it('refuses local writes without immutable proposal confirmation metadata', async () => {
    const localVault = createLocalVaultPort();
    const adapter = new DesktopKnowledgeNotePersistenceAdapter(localVault);

    await expect(
      adapter.createKnowledgeNote({
        identityId: 'identity-1',
        path: 'Research/Unconfirmed.md',
        fileName: 'Unconfirmed.md',
        content: '# Unconfirmed',
        knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440520' as never,
      }),
    ).rejects.toThrow(/confirmed knowledge-note proposal/i);
    expect(localVault.writeConfirmedNote).not.toHaveBeenCalled();
  });

  it('writes the approved revision and maps the Vault note to the AI resource contract', async () => {
    const localVault = createLocalVaultPort();
    const adapter = new DesktopKnowledgeNotePersistenceAdapter(localVault);

    const result = await adapter.createKnowledgeNote({
      identityId: 'identity-1',
      path: 'Research/Approved.md',
      fileName: 'Approved.md',
      content: '# Approved\n\nReviewed body',
      knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440520',
      proposalId: 'proposal-1',
      proposalRevision: 4,
      requestId: 'request-1',
    });

    expect(localVault.writeConfirmedNote).toHaveBeenCalledWith({
      relativePath: 'Research/Approved.md',
      knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440520',
      contentMarkdown: '# Approved\n\nReviewed body',
      proposalId: 'proposal-1',
      proposalRevision: 4,
      requestId: 'request-1',
    });
    expect(result.note).toMatchObject({
      id: 'kdoc_550e8400-e29b-41d4-a716-446655440520',
      name: 'Approved.md',
      path: 'Research/Approved.md',
      content: '# Approved\n\nReviewed body',
      mimeType: 'text/markdown',
      repositoryScopeId: 'local-vault-identity-1',
    });
  });
});
