import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { KnowledgeRemoteBindingClientDTO } from '@memoflow/contracts/repository';
import type { RepositoryApplicationPort } from '@memoflow/repository';
import { RepositoryKnowledgeNotePersistenceAdapter } from './repository-knowledge-note-persistence.adapter';

const DOCUMENT_ID = 'kdoc_550e8400-e29b-41d4-a716-446655440520' as never;

function binding(
  id: string,
  options: { ready?: boolean; disconnected?: boolean } = {},
): KnowledgeRemoteBindingClientDTO {
  const ready = options.ready ?? true;
  return {
    id: id as KnowledgeRemoteBindingClientDTO['id'],
    knowledgeSpaceId: `KnowledgeSpaceId_${id}` as never,
    identityId: 'identity-1' as never,
    provider: 'GitHub',
    installationId: `installation-${id}`,
    repositoryId: `repo-${id}`,
    repositoryFullNameSnapshot: `owner/${id}`,
    connectedAt: 1,
    disconnectedAt: options.disconnected ? 2 : null,
    observation: {
      bindingId: id as KnowledgeRemoteBindingClientDTO['id'],
      observedAt: 1,
      accountId: '42',
      repositoryFullName: `owner/${id}`,
      defaultBranch: 'main',
      private: true,
      archived: false,
      disabled: false,
      contentsPermission: 'write',
      installationSuspended: false,
      eligibility: ready
        ? { state: 'Ready' }
        : { state: 'Blocked', reason: 'RepositoryAccessLost' },
    },
    historyFence: null,
    projectionCheckpoint: null,
  };
}

function createApi(connections: KnowledgeRemoteBindingClientDTO[]) {
  return {
    listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections })),
    createConfirmedKnowledgeNote: vi.fn(async () =>
      ok({
        requestId: 'request-1',
        knowledgeDocumentId: DOCUMENT_ID,
        relativePath: 'notes/Approved.md',
        commitSha: 'commit-1',
        status: 'Committed' as const,
      }),
    ),
  } as unknown as RepositoryApplicationPort;
}

const confirmedContext = {
  requestId: 'req-knp-test',
  traceId: 'req-knp-test',
  startedAt: 1_700_000_000_000,
  source: 'system',
  identityId: 'identity-1',
  deviceId: 'api-server',
};

const confirmedInput = {
  identityId: 'identity-1',
  context: confirmedContext,
  path: 'notes/Approved.md',
  fileName: 'Approved.md',
  content: '# Approved\n\nReviewed body',
  proposalId: 'proposal-1',
  proposalRevision: 2,
  requestId: 'request-1',
  knowledgeDocumentId: DOCUMENT_ID,
};

describe('RepositoryKnowledgeNotePersistenceAdapter', () => {
  it('requires immutable confirmation metadata before contacting GitHub', async () => {
    const api = createApi([binding('binding-1')]);
    const adapter = new RepositoryKnowledgeNotePersistenceAdapter(api);

    await expect(
      adapter.createKnowledgeNote({
        identityId: 'identity-1',
        path: 'notes/Draft.md',
        fileName: 'Draft.md',
        content: '# Draft',
        knowledgeDocumentId: DOCUMENT_ID,
      }),
    ).rejects.toThrow(/confirmed knowledge-note proposal/i);
    expect(api.listKnowledgeRepositoryConnections).not.toHaveBeenCalled();
  });

  it('commits through the selected single ready binding and returns a projection view', async () => {
    const api = createApi([binding('binding-1'), binding('binding-old', { disconnected: true })]);
    const adapter = new RepositoryKnowledgeNotePersistenceAdapter(api);

    const result = await adapter.createKnowledgeNote(confirmedInput);

    expect(api.listKnowledgeRepositoryConnections).toHaveBeenCalledWith(confirmedContext);
    expect(api.createConfirmedKnowledgeNote).toHaveBeenCalledWith(
      confirmedContext,
      expect.objectContaining({
        connectionId: 'binding-1',
        proposalId: 'proposal-1',
        revision: 2,
        requestId: 'request-1',
        proposedPath: 'notes/Approved.md',
        title: 'Approved',
        content: '# Approved\n\nReviewed body',
      }),
    );
    expect(result.note).toMatchObject({
      name: 'Approved.md',
      path: 'notes/Approved.md',
      content: '# Approved\n\nReviewed body',
      mimeType: 'text/markdown',
      repositoryScopeId: 'binding-1',
    });
  });

  it('does not silently choose a repository when multiple ready bindings exist', async () => {
    const api = createApi([binding('binding-1'), binding('binding-2')]);
    const adapter = new RepositoryKnowledgeNotePersistenceAdapter(api);

    await expect(adapter.createKnowledgeNote(confirmedInput)).rejects.toThrow(
      /explicit knowledge repository binding/i,
    );
    expect(api.createConfirmedKnowledgeNote).not.toHaveBeenCalled();
  });

  it('uses an explicit ready binding when multiple repositories are available', async () => {
    const api = createApi([binding('binding-1'), binding('binding-2')]);
    const adapter = new RepositoryKnowledgeNotePersistenceAdapter(api);

    await adapter.createKnowledgeNote({ ...confirmedInput, connectionId: 'binding-2' });

    expect(api.createConfirmedKnowledgeNote).toHaveBeenCalledWith(
      confirmedContext,
      expect.objectContaining({ connectionId: 'binding-2' }),
    );
  });
});
