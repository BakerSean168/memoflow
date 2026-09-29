import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { IRepositoryApiClient } from './ports/repository-api-client.port';
import { RepositoryClientService } from './repository-client-service';

function createApiClient(overrides: Partial<IRepositoryApiClient> = {}): IRepositoryApiClient {
  return {
    startKnowledgeRepositoryInstallation: vi.fn(),
    completeKnowledgeRepositoryInstallation: vi.fn(),
    listKnowledgeRepositoryConnections: vi.fn(),
    connectKnowledgeRepository: vi.fn(),
    disconnectKnowledgeRepository: vi.fn(),
    previewKnowledgeRepositoryReconciliation: vi.fn(),
    executeKnowledgeRepositoryReconciliation: vi.fn(),
    syncKnowledgeRepository: vi.fn(),
    issueDesktopKnowledgeRepositoryToken: vi.fn(),
    listKnowledgeNoteProjections: vi.fn(),
    listReferenceableKnowledgeDocuments: vi.fn(),
    getKnowledgeNoteProjection: vi.fn(),
    getKnowledgeNoteLinkGraph: vi.fn(),
    listKnowledgeAttachmentProjections: vi.fn(),
    getKnowledgeAttachmentContent: vi.fn(),
    createConfirmedKnowledgeNote: vi.fn(),
    getLocalVaultBinding: vi.fn(),
    selectLocalVault: vi.fn(),
    detachLocalVault: vi.fn(),
    scanLocalVault: vi.fn(),
    readLocalVaultNote: vi.fn(),
    searchLocalVault: vi.fn(),
    openLocalVaultInObsidian: vi.fn(),
    writeConfirmedLocalVaultNote: vi.fn(),
    ...overrides,
  } as IRepositoryApiClient;
}

describe('RepositoryClientService', () => {
  it('forwards Desktop knowledge repository synchronization requests', async () => {
    const syncKnowledgeRepository = vi.fn(async () =>
      ok({
        connection: {} as never,
        outcome: 'UpToDate' as const,
        headSha: 'a'.repeat(40),
        localCommitCreated: false,
        remoteChangesApplied: false,
        pushed: false,
      }),
    );
    const service = new RepositoryClientService(createApiClient({ syncKnowledgeRepository }));

    await service.syncKnowledgeRepository({ connectionId: 'connection-1' });

    expect(syncKnowledgeRepository).toHaveBeenCalledWith({ connectionId: 'connection-1' });
  });

  it('forwards referenceable knowledge-document queries', async () => {
    const listReferenceableKnowledgeDocuments = vi.fn(async () =>
      ok({ documents: [], total: 0, nextCursor: null }),
    );
    const service = new RepositoryClientService(
      createApiClient({ listReferenceableKnowledgeDocuments }),
    );
    const abortController = new AbortController();

    await service.listReferenceableKnowledgeDocuments(
      { query: '1Password', limit: 24 },
      { signal: abortController.signal },
    );

    expect(listReferenceableKnowledgeDocuments).toHaveBeenCalledWith(
      { query: '1Password', limit: 24 },
      { signal: abortController.signal },
    );
  });

  it('forwards confirmed knowledge note creation', async () => {
    const createConfirmedKnowledgeNote = vi.fn(async () =>
      ok({
        note: { id: 'projection-1' } as never,
        commitSha: 'b'.repeat(40),
        created: true,
      }),
    );
    const service = new RepositoryClientService(createApiClient({ createConfirmedKnowledgeNote }));

    await service.createConfirmedKnowledgeNote({
      connectionId: 'connection-1',
      proposalId: 'proposal-1',
      revision: 1,
      requestId: 'request-1',
      proposedPath: 'notes/Approved.md',
      title: 'Approved',
      frontmatter: {},
      content: '# Approved',
      reason: 'Reviewed',
    } as never);

    expect(createConfirmedKnowledgeNote).toHaveBeenCalled();
  });
});
