import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { KnowledgeRemoteBindingClientDTO } from '@memoflow/contracts/repository';
import type { KnowledgeRepositoryConnectionService } from '../application/services/knowledge-repository-connection.service';
import type { IKnowledgeRepositoryProjectionService } from '../application/ports/knowledge-repository-projection.service.port';
import { createRepositoryModule } from './repository.module';

function createModule() {
  const issueInstallationToken = vi.fn(async () =>
    ok({
      token: 'repository-token',
      expiresAt: 1_750_000_300_000,
      repositoryId: 'repository-1',
    }),
  );
  const previewFirstReconciliation = vi.fn(async () =>
    ok({
      connectionId: 'connection-1',
      localState: 'NonEmpty' as const,
      remoteState: 'Empty' as const,
      action: 'InitializeRemoteFromLocal' as const,
      defaultBranch: 'main',
      remoteHeadSha: null,
    }),
  );
  const confirmHead = vi.fn(async () =>
    ok({ id: 'connection-1', lastSyncedCommitSha: 'a'.repeat(40) }),
  );
  const connectionService = {
    issueInstallationToken,
    previewFirstReconciliation,
    confirmHead,
  } as unknown as KnowledgeRepositoryConnectionService;
  const module = createRepositoryModule({
    knowledgeRepositoryConnectionService: connectionService,
  });
  return {
    module,
    issueInstallationToken,
    previewFirstReconciliation,
    confirmHead,
  };
}

describe('repository module GitHub credential boundary', () => {
  it('returns an empty knowledge-note list when the optional GitHub App is not configured', async () => {
    const module = createRepositoryModule({});

    await expect(
      module.api.listKnowledgeNoteProjections(
        { identityId: 'identity-without-github-app' },
        { limit: 20 },
      ),
    ).resolves.toEqual(ok({ notes: [], total: 0, nextCursor: null }));
  });

  it('rejects installation token issuance for browser contexts', async () => {
    const { module, issueInstallationToken } = createModule();

    await expect(
      module.api.issueDesktopKnowledgeRepositoryToken(
        {
          identityId: 'identity-browser',
          deviceId: 'browser-device',
          device: { deviceType: 'Browser' },
        },
        'connection-1',
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(issueInstallationToken).not.toHaveBeenCalled();
  });

  it('forwards only Desktop contexts to the identity-scoped connection service', async () => {
    const { module, issueInstallationToken } = createModule();

    await expect(
      module.api.issueDesktopKnowledgeRepositoryToken(
        {
          identityId: 'identity-desktop',
          deviceId: 'desktop-device',
          device: { deviceType: 'Desktop' },
        },
        'connection-1',
      ),
    ).resolves.toMatchObject({ ok: true, data: { repositoryId: 'repository-1' } });
    expect(issueInstallationToken).toHaveBeenCalledWith('identity-desktop', 'connection-1');
  });

  it('keeps local reconciliation preflight behind the Desktop context boundary', async () => {
    const { module, previewFirstReconciliation } = createModule();

    await expect(
      module.api.previewKnowledgeRepositoryReconciliation(
        {
          identityId: 'identity-browser',
          device: { deviceType: 'Browser' },
        },
        'connection-1',
        { localState: 'NonEmpty' },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(previewFirstReconciliation).not.toHaveBeenCalled();

    await expect(
      module.api.previewKnowledgeRepositoryReconciliation(
        {
          identityId: 'identity-desktop',
          device: { deviceType: 'Desktop' },
        },
        'connection-1',
        { localState: 'NonEmpty' },
      ),
    ).resolves.toMatchObject({ ok: true, data: { action: 'InitializeRemoteFromLocal' } });
    expect(previewFirstReconciliation).toHaveBeenCalledWith('identity-desktop', 'connection-1', {
      localState: 'NonEmpty',
    });
  });

  it('keeps reconciliation confirmation behind the Desktop context boundary', async () => {
    const { module, confirmHead } = createModule();

    await expect(
      module.api.confirmKnowledgeRepositoryHead(
        { identityId: 'identity-browser', device: { deviceType: 'Browser' } },
        'connection-1',
        { headSha: 'a'.repeat(40) },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(confirmHead).not.toHaveBeenCalled();

    await module.api.confirmKnowledgeRepositoryHead(
      { identityId: 'identity-desktop', device: { deviceType: 'Desktop' } },
      'connection-1',
      { headSha: 'a'.repeat(40) },
    );
    expect(confirmHead).toHaveBeenCalledWith('identity-desktop', 'connection-1', {
      headSha: 'a'.repeat(40),
    });
  });

  it('starts projection reconciliation immediately after a repository is connected', async () => {
    const connect = vi.fn(async () =>
      ok({
        id: 'connection-1',
      } as unknown as KnowledgeRemoteBindingClientDTO),
    );
    const reconcileNow = vi.fn(async () => undefined);
    const module = createRepositoryModule({
      knowledgeRepositoryConnectionService: {
        connect,
      } as unknown as KnowledgeRepositoryConnectionService,
      knowledgeRepositoryProjectionService: {
        start: () => undefined,
        stop: () => undefined,
        reconcileNow,
      } as unknown as IKnowledgeRepositoryProjectionService,
    });

    await expect(
      module.api.connectKnowledgeRepository(
        { identityId: 'identity-browser', device: { deviceType: 'Browser' } },
        {
          installationId: 'installation-1',
          githubRepositoryId: 'repository-1',
        },
      ),
    ).resolves.toMatchObject({ ok: true, data: { id: 'connection-1' } });

    expect(connect).toHaveBeenCalledWith('identity-browser', {
      installationId: 'installation-1',
      githubRepositoryId: 'repository-1',
    });
    expect(reconcileNow).toHaveBeenCalledTimes(1);
  });

  it('reports write-request list/replay as unavailable when the GitHub App is not configured', async () => {
    const module = createRepositoryModule({});

    await expect(
      module.api.listKnowledgeWriteRequests({ identityId: 'identity-without-github-app' }, { limit: 20 }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });

    await expect(
      module.api.replayKnowledgeWriteRequestProjection(
        { identityId: 'identity-without-github-app' },
        'write-request-1',
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
  });
});
