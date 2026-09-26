import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { repositoryMockRoutes } from './repository.handlers';
import { createHttpClientSpy } from './_shared/contract-test-helpers';

const loadRepositoryClient = () => import('@memoflow/repository/client');
type RepositoryClientModule = Awaited<ReturnType<typeof loadRepositoryClient>>;
let repositoryClient: RepositoryClientModule;

beforeAll(async () => {
  repositoryClient = await loadRepositoryClient();
}, 30_000);

describe('repository handlers contracts', () => {
  it('exposes only knowledge repository route prefixes', () => {
    expect(repositoryMockRoutes.repositories).toMatch(/\/repositories$/);
    expect(repositoryMockRoutes.knowledgeConnections).toMatch(
      /\/repositories\/knowledge-connections$/,
    );
    expect(repositoryMockRoutes.knowledgeNotes).toMatch(/\/repositories\/knowledge-notes$/);
    expect(repositoryMockRoutes.knowledgeAttachments).toMatch(
      /\/repositories\/knowledge-attachments$/,
    );
    expect(repositoryMockRoutes).not.toHaveProperty('current');
    expect(repositoryMockRoutes).not.toHaveProperty('folders');
    expect(repositoryMockRoutes).not.toHaveProperty('resources');
    expect(repositoryMockRoutes).not.toHaveProperty('search');
  });

  it('does not expose retired database Repository/Resource client methods', () => {
    const httpClient = createHttpClientSpy();
    const adapter = new repositoryClient.RepositoryHttpAdapter(httpClient) as Record<string, unknown>;

    for (const method of [
      'getCurrentRepository',
      'listResources',
      'listBookmarks',
      'uploadResources',
      'createResource',
      'updateResource',
      'deleteResource',
      'listFolders',
      'createFolder',
    ]) {
      expect(adapter).not.toHaveProperty(method);
    }

    expect(httpClient.get).not.toHaveBeenCalled();
    expect(httpClient.post).not.toHaveBeenCalled();
    expect(httpClient.request).not.toHaveBeenCalled();
  });

  it('uses knowledge connection and projection routes for the live surface', async () => {
    const httpClient = createHttpClientSpy();
    const adapter = new repositoryClient.RepositoryHttpAdapter(httpClient);

    httpClient.get.mockResolvedValueOnce({ ok: true, data: { connections: [] } });
    httpClient.get.mockResolvedValueOnce({ ok: true, data: { notes: [] } });
    httpClient.get.mockResolvedValueOnce({ ok: true, data: { attachments: [] } });

    await adapter.listKnowledgeRepositoryConnections();
    await adapter.listKnowledgeNoteProjections({ limit: 20 });
    await adapter.listKnowledgeAttachmentProjections({ limit: 20 });

    expect(httpClient.get).toHaveBeenNthCalledWith(1, '/repositories/knowledge-connections');
    expect(httpClient.get).toHaveBeenNthCalledWith(2, '/repositories/knowledge-notes', {
      params: { limit: 20 },
    });
    expect(httpClient.get).toHaveBeenNthCalledWith(3, '/repositories/knowledge-attachments', {
      params: { limit: 20 },
    });
  });

  it('does not register legacy Resource/Folder/Bookmark dual-track MSW stubs', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'repository.handlers.ts'), 'utf8');
    expect(source).not.toContain('Legacy repository route is not mounted');
    expect(source).not.toContain('/resources');
    expect(source).not.toContain('/bookmarks');
    expect(source).not.toContain('/folders');
    expect(source).not.toMatch(/repositories\/current/);
    expect(source).toContain('knowledge-connections');
    expect(source).toContain('knowledge-notes');
    expect(source).toContain('knowledge-attachments');
  });
});

