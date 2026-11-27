import { describe, expect, it, vi } from 'vitest';
import type { LocalVaultElectronPort } from '@memoflow/repository/electron';
import { DesktopKnowledgeNotePersistenceAdapter } from '../desktop-knowledge-note-persistence.adapter';

function createLocalVaultPort(): LocalVaultElectronPort {
  return {
    getBinding: vi.fn(),
    selectVault: vi.fn(),
    detachVault: vi.fn(),
    scanVault: vi.fn(),
    getGitChanges: vi.fn(),
    listRecentWrites: vi.fn(),
    readNote: vi.fn(),
    findNoteById: vi.fn(),
    dispose: vi.fn(),
    searchVault: vi.fn(),
    openInObsidian: vi.fn(),
    writeNote: vi.fn(async () => ({
      created: true,
      note: {
        relativePath: 'Research/Approved.md',
        knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440520' as never,
        title: 'Approved',
        excerpt: 'Reviewed body',
        contentHash: 'a'.repeat(64),
        aliases: [],
        tags: ['agent'],
        outgoingLinks: ['Source'],
        size: 31,
        updatedAt: 1_750_000_000_000 as never,
        contentMarkdown: '# Approved\n\nReviewed body',
        frontmatter: { status: 'reviewed' },
      },
    })),
    writeConfirmedNote: vi.fn(),
    inspectSyncContent: vi.fn(async () => 'NonEmpty'),
  };
}

describe('DesktopKnowledgeNotePersistenceAdapter', () => {
  it('writes directly without per-note proposal metadata and derives a stable request id', async () => {
    const localVault = createLocalVaultPort();
    const adapter = new DesktopKnowledgeNotePersistenceAdapter(localVault);

    await adapter.createKnowledgeNote({
      identityId: 'identity-1',
      context: {
        identityId: 'identity-1',
        requestId: 'tool-request',
        traceId: 'trace-1',
        startedAt: 1,
        source: 'ipc',
      },
      path: 'Research/Unconfirmed.md',
      fileName: 'Unconfirmed.md',
      content: '# Unconfirmed',
      knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440520' as never,
    });

    expect(localVault.writeNote).toHaveBeenCalledWith({
      relativePath: 'Research/Unconfirmed.md',
      knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440520',
      contentMarkdown: '# Unconfirmed',
      requestId: 'tool-request:kdoc_550e8400-e29b-41d4-a716-446655440520:1',
    });
    expect(localVault.writeConfirmedNote).not.toHaveBeenCalled();
  });

  it('maps the Vault note to the AI resource contract', async () => {
    const localVault = createLocalVaultPort();
    const adapter = new DesktopKnowledgeNotePersistenceAdapter(localVault);

    const result = await adapter.createKnowledgeNote({
      identityId: 'identity-1',
      context: {
        identityId: 'identity-1',
        requestId: 'tool-request',
        traceId: 'trace-1',
        startedAt: 1,
        source: 'ipc',
      },
      path: 'Research/Approved.md',
      fileName: 'Approved.md',
      content: '# Approved\n\nReviewed body',
      knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440520',
      source: { kind: 'local_vault' },
      proposalId: 'proposal-1',
      proposalRevision: 4,
      requestId: 'request-1',
    });

    expect(localVault.writeNote).toHaveBeenCalledWith({
      relativePath: 'Research/Approved.md',
      knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440520',
      contentMarkdown: '# Approved\n\nReviewed body',
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

  it('forwards expected hashes for direct updates', async () => {
    const localVault = createLocalVaultPort();
    const adapter = new DesktopKnowledgeNotePersistenceAdapter(localVault);

    await adapter.writeKnowledgeNote({
      identityId: 'identity-1',
      context: {
        identityId: 'identity-1',
        requestId: 'tool-request',
        traceId: 'trace-1',
        startedAt: 1,
        source: 'ipc',
      },
      relativePath: 'Research/Approved.md',
      contentMarkdown: '# Approved\n\nNew body',
      requestId: 'direct-1',
      expectedContentHash: 'b'.repeat(64),
    });

    expect(localVault.writeNote).toHaveBeenCalledWith({
      relativePath: 'Research/Approved.md',
      contentMarkdown: '# Approved\n\nNew body',
      requestId: 'direct-1',
      expectedContentHash: 'b'.repeat(64),
    });
  });

  it('rejects a Web repository source on the Desktop persistence host', async () => {
    const localVault = createLocalVaultPort();
    const adapter = new DesktopKnowledgeNotePersistenceAdapter(localVault);

    await expect(
      adapter.createKnowledgeNote({
        identityId: 'identity-1',
        context: {
          identityId: 'identity-1',
          requestId: 'tool-request',
          traceId: 'trace-1',
          startedAt: 1,
          source: 'ipc',
        },
        path: 'Research/Approved.md',
        fileName: 'Approved.md',
        content: '# Approved',
        knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440520',
        source: { kind: 'repository', connectionId: 'binding-1' },
        proposalId: 'proposal-1',
        proposalRevision: 1,
        requestId: 'request-1',
      }),
    ).rejects.toThrow(/requires a local Vault source/i);
    expect(localVault.writeNote).not.toHaveBeenCalled();
  });
});
