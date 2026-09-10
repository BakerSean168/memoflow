import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { KnowledgeRepositoryConnectionClientDTO } from '@memoflow/contracts/repository';
import { DesktopKnowledgeRepositoryReconciliationService } from './desktop-knowledge-repository-reconciliation.service';
import type { KnowledgeRepositoryGitRuntimePort } from './desktop-knowledge-repository-git.runtime';

const NOW = 1_750_000_000_000;
const HEAD = 'a'.repeat(40);

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
    lastSyncedCommitSha: null,
    lastErrorCode: null,
    canSync: true,
    createdAt: NOW as KnowledgeRepositoryConnectionClientDTO['createdAt'],
    updatedAt: NOW as KnowledgeRepositoryConnectionClientDTO['updatedAt'],
    ...overrides,
  };
}

function createFixture(options?: {
  previewHead?: string | null;
  previewAction?: 'InitializeRemoteFromLocal' | 'CloneRemoteIntoLocal' | 'ManualResolutionRequired';
  inspectionHead?: string | null;
  manifestRepositoryId?: string | null;
  tokenExpiresAt?: number;
}) {
  const current = connection();
  const localBindingId = 'LocalVaultBindingId_550e8400-e29b-41d4-a716-446655440030' as never;
  const localVault = {
    getBinding: vi.fn(async () => ({
      binding: {
        id: localBindingId,
        knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440031' as never,
        localProfileId: 'p_reconciliation',
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
    inspectSyncContent: vi.fn(async () => 'NonEmpty' as const),
  };
  const remote = {
    listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [current] })),
    previewKnowledgeRepositoryReconciliation: vi.fn(async () =>
      ok({
        connectionId: current.id,
        localState: 'NonEmpty' as const,
        remoteState: options?.previewHead ? ('NonEmpty' as const) : ('Empty' as const),
        action: options?.previewAction ?? ('InitializeRemoteFromLocal' as const),
        defaultBranch: 'main',
        remoteHeadSha: options?.previewHead ?? null,
      }),
    ),
    issueDesktopKnowledgeRepositoryToken: vi.fn(async () =>
      ok({
        token: 'repository-token',
        repositoryId: current.githubRepositoryId,
        expiresAt: options?.tokenExpiresAt ?? NOW + 300_000,
      }),
    ),
    confirmKnowledgeRepositoryHead: vi.fn(async (_id, request) =>
      ok(connection({ lastSyncedCommitSha: request.headSha })),
    ),
  };
  const gitRuntime: KnowledgeRepositoryGitRuntimePort = {
    inspect: vi.fn(async () => ({
      headSha: options?.inspectionHead ?? null,
      manifest: options?.manifestRepositoryId
        ? {
            schemaVersion: 1,
            repositoryId: options.manifestRepositoryId,
            capabilities: { markdown: true, attachments: true },
          }
        : null,
    })),
    reconcile: vi.fn(async () => ({ headSha: HEAD })),
  };
  const service = new DesktopKnowledgeRepositoryReconciliationService({
    localVault: localVault as never,
    remote,
    gitRuntime,
    now: () => NOW,
  });
  return { service, localVault, remote, gitRuntime, current };
}

describe('DesktopKnowledgeRepositoryReconciliationService', () => {
  it('revalidates the immutable preview, uses a repository token, and confirms GitHub HEAD', async () => {
    const { service, remote, gitRuntime, current } = createFixture();

    await expect(
      service.execute('identity-1', {
        connectionId: current.id,
        expectedAction: 'InitializeRemoteFromLocal',
        expectedDefaultBranch: 'main',
        expectedRemoteHeadSha: null,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        action: 'InitializeRemoteFromLocal',
        headSha: HEAD,
        reusedExistingSynchronization: false,
        connection: { lastSyncedCommitSha: HEAD },
      },
    });

    expect(gitRuntime.reconcile).toHaveBeenCalledWith({
      rootPath: '/vault',
      repositoryId: current.githubRepositoryId,
      repositoryFullName: current.githubRepositoryFullName,
      defaultBranch: 'main',
      expectedRemoteHeadSha: null,
      action: 'InitializeRemoteFromLocal',
      token: 'repository-token',
    });
    expect(remote.confirmKnowledgeRepositoryHead).toHaveBeenCalledWith(current.id, {
      headSha: HEAD,
    });
  });

  it('blocks execution when the remote HEAD changed after user confirmation', async () => {
    const { service, remote, gitRuntime, current } = createFixture({ previewHead: HEAD });

    await expect(
      service.execute('identity-1', {
        connectionId: current.id,
        expectedAction: 'InitializeRemoteFromLocal',
        expectedDefaultBranch: 'main',
        expectedRemoteHeadSha: null,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(remote.issueDesktopKnowledgeRepositoryToken).not.toHaveBeenCalled();
    expect(gitRuntime.reconcile).not.toHaveBeenCalled();
  });

  it('repairs a lost server confirmation without repeating Git mutation', async () => {
    const { service, remote, gitRuntime, current } = createFixture({
      previewHead: HEAD,
      previewAction: 'ManualResolutionRequired',
      inspectionHead: HEAD,
      manifestRepositoryId: '987654321',
    });

    await expect(
      service.execute('identity-1', {
        connectionId: current.id,
        expectedAction: 'CloneRemoteIntoLocal',
        expectedDefaultBranch: 'main',
        expectedRemoteHeadSha: 'b'.repeat(40),
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { headSha: HEAD, reusedExistingSynchronization: true },
    });
    expect(gitRuntime.reconcile).not.toHaveBeenCalled();
    expect(remote.issueDesktopKnowledgeRepositoryToken).not.toHaveBeenCalled();
    expect(remote.confirmKnowledgeRepositoryHead).toHaveBeenCalledWith(current.id, {
      headSha: HEAD,
    });
  });

  it('rejects a repository token that expires before Git can safely start', async () => {
    const { service, gitRuntime, current } = createFixture({ tokenExpiresAt: NOW + 10_000 });

    await expect(
      service.execute('identity-1', {
        connectionId: current.id,
        expectedAction: 'InitializeRemoteFromLocal',
        expectedDefaultBranch: 'main',
        expectedRemoteHeadSha: null,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(gitRuntime.reconcile).not.toHaveBeenCalled();
  });
});
