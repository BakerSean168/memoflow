import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import { RepositoryHttpAdapter } from './repository-http.adapter';

function createResultHttpClientStub() {
  return {
    get: vi.fn(async () => ok({ connections: [] })),
    post: vi.fn(async () => ok({})),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(async () => ok(null)),
  } as unknown as IResultHttpClient;
}

describe('RepositoryHttpAdapter knowledge repository connections', () => {
  it('uses the dedicated GitHub App installation and connection endpoints', async () => {
    const httpClient = createResultHttpClientStub();
    const adapter = new RepositoryHttpAdapter(httpClient);

    await adapter.startKnowledgeRepositoryInstallation({
      returnUrl: 'https://app.example.test/settings?tab=repository',
    });
    await adapter.completeKnowledgeRepositoryInstallation({
      state: 'state-state-state-state',
      installationId: 'installation-1',
      setupAction: 'install',
    });
    await adapter.getKnowledgeRepositoryInstallationIntentStatus('intent/1');
    await adapter.finalizeKnowledgeRepositoryInstallationIntent('intent/1');
    await adapter.listKnowledgeRepositoryConnections();
    await adapter.connectKnowledgeRepository({
      installationId: 'installation-1',
      githubRepositoryId: 'repository-1',
    });
    await adapter.disconnectKnowledgeRepository('connection/1', true);
    await expect(
      adapter.previewKnowledgeRepositoryReconciliation('connection/1'),
    ).resolves.toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    await expect(
      adapter.executeKnowledgeRepositoryReconciliation({} as never),
    ).resolves.toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    await expect(adapter.syncKnowledgeRepository({} as never)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
    await adapter.issueDesktopKnowledgeRepositoryToken('connection/1');

    expect(httpClient.post).toHaveBeenNthCalledWith(
      1,
      '/repositories/knowledge-connections/installations/start',
      { returnUrl: 'https://app.example.test/settings?tab=repository' },
    );
    expect(httpClient.post).toHaveBeenNthCalledWith(
      2,
      '/repositories/knowledge-connections/installations/complete',
      {
        state: 'state-state-state-state',
        installationId: 'installation-1',
        setupAction: 'install',
      },
    );
    expect(httpClient.get).toHaveBeenCalledWith(
      '/repositories/knowledge-connections/installations/intents/intent%2F1',
    );
    expect(httpClient.post).toHaveBeenNthCalledWith(
      3,
      '/repositories/knowledge-connections/installations/intents/intent%2F1/finalize',
      {},
    );
    expect(httpClient.get).toHaveBeenCalledWith('/repositories/knowledge-connections');
    expect(httpClient.post).toHaveBeenNthCalledWith(4, '/repositories/knowledge-connections', {
      installationId: 'installation-1',
      githubRepositoryId: 'repository-1',
    });
    expect(httpClient.delete).toHaveBeenCalledWith(
      '/repositories/knowledge-connections/connection%2F1',
      { params: { purgeCloudData: true } },
    );
    expect(httpClient.post).toHaveBeenNthCalledWith(
      5,
      '/repositories/knowledge-connections/connection%2F1/desktop-token',
    );
  });

  it('uses the dedicated referenceable knowledge-document endpoint', async () => {
    const httpClient = createResultHttpClientStub();
    const adapter = new RepositoryHttpAdapter(httpClient);
    const abortController = new AbortController();

    await adapter.listReferenceableKnowledgeDocuments(
      {
        query: '1Password',
        cursor: 'r~1759017600000~projection-181',
        limit: 24,
      },
      { signal: abortController.signal },
    );

    expect(httpClient.get).toHaveBeenCalledWith('/repositories/knowledge-documents/referenceable', {
      signal: abortController.signal,
      params: {
        query: '1Password',
        cursor: 'r~1759017600000~projection-181',
        limit: 24,
      },
    });
  });

  it('uses the projection read and confirmed-create endpoints', async () => {
    const httpClient = createResultHttpClientStub();
    const adapter = new RepositoryHttpAdapter(httpClient);

    const abortController = new AbortController();
    await adapter.listKnowledgeNoteProjections(
      {
        connectionId: 'connection/1',
        query: 'distributed systems',
        cursor: 'q~2500~1759017600000~projection-25',
        sort: 'recent',
        limit: 25,
      },
      { signal: abortController.signal },
    );
    await adapter.listKnowledgeNoteTree(
      {
        connectionId: 'connection/1',
        parent: 'assets',
        includeHidden: true,
      },
      { signal: abortController.signal },
    );
    await adapter.resolveKnowledgeNoteReference(
      {
        connectionId: 'connection/1',
        reference: 'KnowledgeDocumentId_11111111-1111-4111-8111-111111111111',
      },
      { signal: abortController.signal },
    );
    await adapter.getKnowledgeNoteProjection('projection/1', {
      signal: abortController.signal,
    });
    await adapter.getKnowledgeNoteLinkGraph('projection/1', { depth: 2, maxNodes: 30 });
    await adapter.listKnowledgeAttachmentProjections({
      connectionId: 'connection/1',
      query: 'diagram',
      limit: 20,
    });
    await adapter.getKnowledgeAttachmentContent('attachment/1');
    await adapter.createConfirmedKnowledgeNote({
      connectionId: 'connection/1',
      proposalId: 'proposal-1',
      revision: 1,
      requestId: 'request-1',
      proposedPath: 'notes/Approved.md',
      title: 'Approved',
      frontmatter: {},
      content: '# Approved',
      reason: 'Reviewed by the user',
    });

    expect(httpClient.get).toHaveBeenNthCalledWith(1, '/repositories/knowledge-notes', {
      signal: abortController.signal,
      params: {
        connectionId: 'connection/1',
        query: 'distributed systems',
        cursor: 'q~2500~1759017600000~projection-25',
        sort: 'recent',
        limit: 25,
      },
    });
    expect(httpClient.get).toHaveBeenNthCalledWith(2, '/repositories/knowledge-notes/tree', {
      signal: abortController.signal,
      params: {
        connectionId: 'connection/1',
        parent: 'assets',
        includeHidden: 'true',
      },
    });
    expect(httpClient.get).toHaveBeenNthCalledWith(3, '/repositories/knowledge-notes/resolve', {
      signal: abortController.signal,
      params: {
        connectionId: 'connection/1',
        reference: 'KnowledgeDocumentId_11111111-1111-4111-8111-111111111111',
      },
    });
    expect(httpClient.get).toHaveBeenNthCalledWith(
      4,
      '/repositories/knowledge-notes/projection%2F1',
      { signal: abortController.signal },
    );
    expect(httpClient.get).toHaveBeenNthCalledWith(
      5,
      '/repositories/knowledge-notes/projection%2F1/link-graph',
      { params: { depth: 2, maxNodes: 30 } },
    );
    expect(httpClient.get).toHaveBeenNthCalledWith(6, '/repositories/knowledge-attachments', {
      params: { connectionId: 'connection/1', query: 'diagram', limit: 20 },
    });
    expect(httpClient.get).toHaveBeenNthCalledWith(
      7,
      '/repositories/knowledge-attachments/attachment%2F1/content',
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      '/repositories/knowledge-notes',
      expect.objectContaining({ requestId: 'request-1', proposedPath: 'notes/Approved.md' }),
    );
  });
});

describe('RepositoryHttpAdapter retired surface', () => {
  it('does not keep hard-fail stubs for retired CRUD methods', () => {
    const adapter = new RepositoryHttpAdapter(createResultHttpClientStub()) as Record<
      string,
      unknown
    >;
    for (const method of [
      'getCurrentRepository',
      'listResources',
      'listBookmarks',
      'uploadResources',
      'createResource',
      'updateResource',
      'deleteResource',
    ]) {
      expect(adapter).not.toHaveProperty(method);
    }
  });
});
