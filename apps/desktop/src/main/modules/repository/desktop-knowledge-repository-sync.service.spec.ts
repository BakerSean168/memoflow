import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeRepositoryConnectionClientDTO } from '@memoflow/contracts/repository';
import { fail, ok } from '@memoflow/contracts/result';
import {
  KnowledgeRepositoryGitRuntimeError,
  type KnowledgeRepositorySyncGitRuntimePort,
} from './desktop-knowledge-repository-git.runtime';
import { DesktopKnowledgeRepositorySyncService } from './desktop-knowledge-repository-sync.service';

const NOW = 1_750_000_000_000;
const PREVIOUS_HEAD = 'a'.repeat(40);
const NEXT_HEAD = 'b'.repeat(40);

function connection(
  overrides: Partial<KnowledgeRepositoryConnectionClientDTO> = {},
): KnowledgeRepositoryConnectionClientDTO {
  return {
    id: 'connection-1',
    identityId:
      'IdentityId_11111111-1111-4111-8111-111111111111' as KnowledgeRepositoryConnectionClientDTO['identityId'],
    githubUserId: '42',
    githubRepositoryId: '987654321',
    githubRepositoryFullName: 'owner/knowledge',
    installationId: 'installation-1',
    defaultBranch: 'main',
    status: 'Active',
    lastSyncedCommitSha: PREVIOUS_HEAD,
    lastErrorCode: null,
    canSync: true,
    createdAt: NOW as KnowledgeRepositoryConnectionClientDTO['createdAt'],
    updatedAt: NOW as KnowledgeRepositoryConnectionClientDTO['updatedAt'],
    ...overrides,
  };
}

function createFixture(options?: {
  current?: KnowledgeRepositoryConnectionClientDTO;
  tokenFailure?: boolean;
  tokenExpiresAt?: number;
}) {
  const current = options?.current ?? connection();
  const localBindingId = 'LocalVaultBindingId_550e8400-e29b-41d4-a716-446655440020' as never;
  const localVault = {
    getBinding: vi.fn(async () => ({
      binding: {
        id: localBindingId,
        knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440021' as never,
        localProfileId: 'p_sync_service',
        rootPath: '/vault',
        displayName: 'Vault',
        boundAt: NOW,
        detachedAt: null,
      },
      health: {
        bindingId: localBindingId,
        state: 'Available' as const,
        observedAt: NOW,
        detail: null,
      },
    })),
  };
  const remote = {
    listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [current] })),
    issueDesktopKnowledgeRepositoryToken: vi.fn(async () =>
      options?.tokenFailure
        ? fail({ code: 'SERVICE_UNAVAILABLE', message: 'offline' })
        : ok({
            token: 'repository-token',
            repositoryId: current.githubRepositoryId,
            expiresAt: options?.tokenExpiresAt ?? NOW + 300_000,
          }),
    ),
    confirmKnowledgeRepositoryHead: vi.fn(async (_connectionId, request) =>
      ok(connection({ lastSyncedCommitSha: request.headSha })),
    ),
  };
  const gitRuntime: KnowledgeRepositorySyncGitRuntimePort = {
    prepareSynchronization: vi.fn(async () => ({
      headSha: PREVIOUS_HEAD,
      localCommitCreated: true,
    })),
    synchronize: vi.fn(async () => ({
      outcome: 'Pushed' as const,
      headSha: NEXT_HEAD,
      localCommitCreated: false,
      remoteChangesApplied: false,
      pushed: true,
    })),
  };
  const service = new DesktopKnowledgeRepositorySyncService({
    localVault: localVault as never,
    remote,
    gitRuntime,
    now: () => NOW,
  });
  return { service, localVault, remote, gitRuntime, current };
}

describe('DesktopKnowledgeRepositorySyncService', () => {
  it('commits locally before requesting a token, then confirms the live GitHub HEAD', async () => {
    const { service, remote, gitRuntime, current } = createFixture();

    await expect(
      service.execute('identity-1', { connectionId: current.id }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        outcome: 'Pushed',
        headSha: NEXT_HEAD,
        localCommitCreated: true,
        remoteChangesApplied: false,
        pushed: true,
        connection: { lastSyncedCommitSha: NEXT_HEAD },
      },
    });

    expect(vi.mocked(gitRuntime.prepareSynchronization).mock.invocationCallOrder[0]).toBeLessThan(
      remote.issueDesktopKnowledgeRepositoryToken.mock.invocationCallOrder[0]!,
    );
    expect(gitRuntime.synchronize).toHaveBeenCalledWith({
      rootPath: '/vault',
      repositoryId: current.githubRepositoryId,
      repositoryFullName: current.githubRepositoryFullName,
      defaultBranch: 'main',
      lastSyncedCommitSha: PREVIOUS_HEAD,
      token: 'repository-token',
    });
    expect(remote.confirmKnowledgeRepositoryHead).toHaveBeenCalledWith(current.id, {
      headSha: NEXT_HEAD,
    });
  });

  it('keeps the prepared local commit when the online token request is unavailable', async () => {
    const { service, remote, gitRuntime, current } = createFixture({ tokenFailure: true });

    await expect(
      service.execute('identity-1', { connectionId: current.id }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        context: {
          localHeadSha: PREVIOUS_HEAD,
          localCommitCreated: true,
          uploadPending: true,
        },
      },
    });

    expect(gitRuntime.prepareSynchronization).toHaveBeenCalledOnce();
    expect(remote.issueDesktopKnowledgeRepositoryToken).toHaveBeenCalledOnce();
    expect(gitRuntime.synchronize).not.toHaveBeenCalled();
    expect(remote.confirmKnowledgeRepositoryHead).not.toHaveBeenCalled();
  });

  it('requires a confirmed first synchronization before continuous sync', async () => {
    const { service, remote, gitRuntime, current } = createFixture({
      current: connection({ lastSyncedCommitSha: null }),
    });

    await expect(
      service.execute('identity-1', { connectionId: current.id }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(gitRuntime.prepareSynchronization).not.toHaveBeenCalled();
    expect(remote.issueDesktopKnowledgeRepositoryToken).not.toHaveBeenCalled();
  });

  it('returns structured rebase conflict details without requesting credentials', async () => {
    const { service, remote, gitRuntime, current } = createFixture();
    vi.mocked(gitRuntime.prepareSynchronization).mockRejectedValueOnce(
      new KnowledgeRepositoryGitRuntimeError('CONFLICT', 'resolve conflict', {
        localHeadSha: PREVIOUS_HEAD,
        remoteHeadSha: NEXT_HEAD,
        conflictingPaths: ['notes/shared.md'],
        rebaseInProgress: true,
      }),
    );

    await expect(
      service.execute('identity-1', { connectionId: current.id }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        context: {
          conflictingPaths: ['notes/shared.md'],
          rebaseInProgress: true,
        },
      },
    });
    expect(remote.issueDesktopKnowledgeRepositoryToken).not.toHaveBeenCalled();
  });

  it('rejects a token that is too close to expiry after preserving local changes', async () => {
    const { service, remote, gitRuntime, current } = createFixture({
      tokenExpiresAt: NOW + 10_000,
    });

    await expect(
      service.execute('identity-1', { connectionId: current.id }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED', context: { uploadPending: true } },
    });
    expect(gitRuntime.prepareSynchronization).toHaveBeenCalledOnce();
    expect(gitRuntime.synchronize).not.toHaveBeenCalled();
    expect(remote.confirmKnowledgeRepositoryHead).not.toHaveBeenCalled();
  });

  it('creates a shutdown commit from the cached connection without requesting the network', async () => {
    const { service, localVault, remote, gitRuntime, current } = createFixture();

    await expect(service.commitLocalChanges('identity-1', current)).resolves.toEqual(
      ok({
        connectionId: current.id,
        headSha: PREVIOUS_HEAD,
        localCommitCreated: true,
      }),
    );

    expect(localVault.getBinding).toHaveBeenCalledWith();
    expect(gitRuntime.prepareSynchronization).toHaveBeenCalledWith({
      rootPath: '/vault',
      repositoryId: current.githubRepositoryId,
      repositoryFullName: current.githubRepositoryFullName,
      defaultBranch: current.defaultBranch,
      lastSyncedCommitSha: current.lastSyncedCommitSha,
    });
    expect(remote.listKnowledgeRepositoryConnections).not.toHaveBeenCalled();
    expect(remote.issueDesktopKnowledgeRepositoryToken).not.toHaveBeenCalled();
    expect(gitRuntime.synchronize).not.toHaveBeenCalled();
  });

  it('uses a trusted cached connection for automatic offline commit before token issuance', async () => {
    const { service, remote, gitRuntime, current } = createFixture({ tokenFailure: true });

    await expect(service.executeAutomatic('identity-1', current)).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        context: {
          localHeadSha: PREVIOUS_HEAD,
          localCommitCreated: true,
          uploadPending: true,
        },
      },
    });

    expect(remote.listKnowledgeRepositoryConnections).not.toHaveBeenCalled();
    expect(vi.mocked(gitRuntime.prepareSynchronization).mock.invocationCallOrder[0]).toBeLessThan(
      remote.issueDesktopKnowledgeRepositoryToken.mock.invocationCallOrder[0]!,
    );
    expect(gitRuntime.synchronize).not.toHaveBeenCalled();
  });
});
