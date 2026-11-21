import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts/result';
import type { KnowledgeRemoteBindingClientDTO } from '@memoflow/repository-contracts';
import {
  isKnowledgeRepositoryNotConfiguredFailure,
  KNOWLEDGE_REPOSITORY_NOT_CONFIGURED_REASON,
} from '@memoflow/repository-contracts';
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

  it('rejects retired sync operations even when a caller claims Desktop context', async () => {
    const { module, issueInstallationToken, previewFirstReconciliation, confirmHead } =
      createModule();
    const context = { identityId: 'identity-desktop', device: { deviceType: 'Desktop' as const } };
    for (const result of [
      await module.api.issueDesktopKnowledgeRepositoryToken(context, 'connection-1'),
      await module.api.previewKnowledgeRepositoryReconciliation(context, 'connection-1', {
        localState: 'NonEmpty',
      }),
      await module.api.confirmKnowledgeRepositoryHead(context, 'connection-1', {
        headSha: 'a'.repeat(40),
      }),
    ])
      expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(issueInstallationToken).not.toHaveBeenCalled();
    expect(previewFirstReconciliation).not.toHaveBeenCalled();
    expect(confirmHead).not.toHaveBeenCalled();
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

  it('marks the unconfigured knowledge connection list as a neutral capability state', async () => {
    const module = createRepositoryModule({});

    const result = await module.api.listKnowledgeRepositoryConnections({
      identityId: 'identity-without-github-app',
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'GitHub App knowledge repository connections are not configured',
        context: { reason: KNOWLEDGE_REPOSITORY_NOT_CONFIGURED_REASON },
      },
    });
    // The same failure shape the settings UI consumes must be classified as the
    // neutral not-configured state, not as a runtime error.
    if (!result.ok) {
      expect(isKnowledgeRepositoryNotConfiguredFailure(result.error)).toBe(true);
    }
  });

  it('reports unconfigured receipt queries separately from forbidden replay', async () => {
    const module = createRepositoryModule({});

    await expect(
      module.api.listKnowledgeWriteRequests(
        { identityId: 'identity-without-github-app' },
        { limit: 20 },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });

    await expect(
      module.api.replayKnowledgeWriteRequestProjection(
        { identityId: 'identity-without-github-app' },
        'write-request-1',
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });
});
