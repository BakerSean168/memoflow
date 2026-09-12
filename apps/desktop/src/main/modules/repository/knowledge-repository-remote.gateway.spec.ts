import { describe, expect, it, vi } from 'vitest';
import { KnowledgeRepositoryRemoteGateway } from './knowledge-repository-remote.gateway';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('KnowledgeRepositoryRemoteGateway', () => {
  it('authenticates installation start without mixing GitHub login scopes', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        ok: true,
        data: {
          installationUrl: 'https://github.com/apps/memoflow/installations/new?state=state',
          expiresAt: 1_750_000_600_000,
        },
      }),
    );
    const gateway = new KnowledgeRepositoryRemoteGateway({
      getAccessToken: async () => 'memoflow-access-token',
      fetchImpl,
      createApiUrl: (path) => `https://api.example.test/api/v1${path}`,
    });

    await expect(
      gateway.startKnowledgeRepositoryInstallation({
        returnUrl: 'memoflow://settings/repository',
      }),
    ).resolves.toMatchObject({ ok: true, data: { expiresAt: 1_750_000_600_000 } });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/repositories/knowledge-connections/installations/start',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer memoflow-access-token',
          'user-agent': 'MemoFlow Desktop Electron',
        }),
        body: JSON.stringify({ returnUrl: 'memoflow://settings/repository' }),
      }),
    );
  });

  it('polls and finalizes durable installation intents through authenticated API routes', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          ok: true,
          data: {
            intentId: 'intent-1',
            status: 'CallbackReceived',
            clientKind: 'desktop',
            expiresAt: 1_750_000_600_000,
            installationId: 'installation-1',
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          ok: true,
          data: {
            installationId: 'installation-1',
            githubAccountId: '42',
            repositories: [],
            returnUrl: 'https://app.example.test/settings?tab=repository',
          },
        }),
      );
    const gateway = new KnowledgeRepositoryRemoteGateway({
      getAccessToken: async () => 'memoflow-access-token',
      fetchImpl,
      createApiUrl: (path) => `https://api.example.test/api/v1${path}`,
    });

    await gateway.getKnowledgeRepositoryInstallationIntentStatus('intent/1');
    await gateway.finalizeKnowledgeRepositoryInstallationIntent('intent/1');

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://api.example.test/api/v1/repositories/knowledge-connections/installations/intents/intent%2F1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.example.test/api/v1/repositories/knowledge-connections/installations/intents/intent%2F1/finalize',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });

  it('requests the Desktop-only repository token through the dedicated endpoint', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        ok: true,
        data: {
          token: 'short-lived-token',
          expiresAt: 1_750_000_300_000,
          repositoryId: 'repository-1',
        },
      }),
    );
    const gateway = new KnowledgeRepositoryRemoteGateway({
      getAccessToken: async () => 'memoflow-access-token',
      fetchImpl,
      createApiUrl: (path) => `https://api.example.test/api/v1${path}`,
    });

    await expect(
      gateway.issueDesktopKnowledgeRepositoryToken('connection/1'),
    ).resolves.toMatchObject({ ok: true, data: { repositoryId: 'repository-1' } });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/repositories/knowledge-connections/connection%2F1/desktop-token',
    );
  });

  it('forwards the explicit cloud-data retention choice when disconnecting', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ ok: true, data: null }));
    const gateway = new KnowledgeRepositoryRemoteGateway({
      getAccessToken: async () => 'memoflow-access-token',
      fetchImpl,
      createApiUrl: (path) => `https://api.example.test/api/v1${path}`,
    });

    await gateway.disconnectKnowledgeRepository('connection/1', true);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/repositories/knowledge-connections/connection%2F1?purgeCloudData=true',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('sends only the local content shape for first-reconciliation preflight', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        ok: true,
        data: {
          connectionId: 'connection/1',
          localState: 'NonEmpty',
          remoteState: 'Empty',
          action: 'InitializeRemoteFromLocal',
          defaultBranch: 'main',
          remoteHeadSha: null,
        },
      }),
    );
    const gateway = new KnowledgeRepositoryRemoteGateway({
      getAccessToken: async () => 'memoflow-access-token',
      fetchImpl,
      createApiUrl: (path) => `https://api.example.test/api/v1${path}`,
    });

    await expect(
      gateway.previewKnowledgeRepositoryReconciliation('connection/1', 'NonEmpty'),
    ).resolves.toMatchObject({
      ok: true,
      data: { action: 'InitializeRemoteFromLocal' },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/repositories/knowledge-connections/connection%2F1/reconciliation-preview',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ localState: 'NonEmpty' }),
      }),
    );
  });

  it('confirms the pushed HEAD through the Desktop-only server endpoint', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        ok: true,
        data: {
          id: 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440060',
          historyFence: {
            lastConfirmedRemoteHeadSha: 'a'.repeat(40),
          },
        },
      }),
    );
    const gateway = new KnowledgeRepositoryRemoteGateway({
      getAccessToken: async () => 'memoflow-access-token',
      fetchImpl,
      createApiUrl: (path) => `https://api.example.test/api/v1${path}`,
    });

    await gateway.confirmKnowledgeRepositoryHead('connection/1', {
      headSha: 'a'.repeat(40),
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/repositories/knowledge-connections/connection%2F1/head-confirmation',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ headSha: 'a'.repeat(40) }),
      }),
    );
  });

  it('does not make an online request for guest or signed-out profiles', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const gateway = new KnowledgeRepositoryRemoteGateway({
      getAccessToken: async () => null,
      fetchImpl,
      createApiUrl: (path) => path,
    });

    await expect(gateway.listKnowledgeRepositoryConnections()).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('preserves structured server authorization failures', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response(
        {
          ok: false,
          error: {
            code: 'FORBIDDEN',
            message: 'GitHub installation tokens are available only to Desktop clients',
          },
        },
        403,
      ),
    );
    const gateway = new KnowledgeRepositoryRemoteGateway({
      getAccessToken: async () => 'memoflow-access-token',
      fetchImpl,
      createApiUrl: (path) => path,
    });

    await expect(
      gateway.issueDesktopKnowledgeRepositoryToken('connection-1'),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'GitHub installation tokens are available only to Desktop clients',
      },
    });
  });

  it('fails closed when a successful response omits the data envelope', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        // Raw dual-track body without data — rejected for first-party knowledge API.
        installationUrl: 'https://github.com/apps/memoflow/installations/new',
        expiresAt: 1_750_000_600_000,
      }),
    );
    const gateway = new KnowledgeRepositoryRemoteGateway({
      getAccessToken: async () => 'memoflow-access-token',
      fetchImpl,
      createApiUrl: (path) => path,
    });

    await expect(gateway.startKnowledgeRepositoryInstallation()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: expect.stringMatching(/data envelope|dual-track/i),
      },
    });
  });
});
