import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { KnowledgeRemoteBindingClientDTO } from '@memoflow/contracts/repository';
import { DesktopKnowledgeRepositoryReconciliationService } from './desktop-knowledge-repository-reconciliation.service';
import type { KnowledgeRepositoryGitRuntimePort } from './desktop-knowledge-repository-git.runtime';

const NOW = 1_750_000_000_000;
const HEAD = 'a'.repeat(40);

const SPACE_ID = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440031' as never;
const BINDING_ID = 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440032' as never;

function connection(
  overrides: Partial<KnowledgeRemoteBindingClientDTO> = {},
): KnowledgeRemoteBindingClientDTO {
  const base: KnowledgeRemoteBindingClientDTO = {
    id: BINDING_ID,
    knowledgeSpaceId: SPACE_ID,
    identityId:
      'IdentityId_11111111-1111-4111-8111-111111111111' as KnowledgeRemoteBindingClientDTO['identityId'],
    provider: 'GitHub',
    installationId: 'installation-1',
    repositoryId: '987654321',
    repositoryFullNameSnapshot: 'owner/knowledge',
    connectedAt: NOW,
    disconnectedAt: null,
    observation: {
      bindingId: BINDING_ID,
      observedAt: NOW,
      accountId: '42',
      repositoryFullName: 'owner/knowledge',
      defaultBranch: 'main',
      private: true,
      archived: false,
      disabled: false,
      contentsPermission: 'write',
      installationSuspended: false,
      eligibility: { state: 'Ready' },
    },
    historyFence: null,
    projectionCheckpoint: null,
  };
  return { ...base, ...overrides };
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
        knowledgeSpaceId: SPACE_ID,
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
        repositoryId: current.repositoryId,
        expiresAt: options?.tokenExpiresAt ?? NOW + 300_000,
      }),
    ),
    confirmKnowledgeRepositoryHead: vi.fn(async (_id, request) =>
      ok(
        connection({
          historyFence: {
            bindingId: current.id,
            defaultBranch: 'main',
            lastConfirmedRemoteHeadSha: request.headSha,
            confirmedAt: NOW,
          },
        }),
      ),
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
        connection: { historyFence: { lastConfirmedRemoteHeadSha: HEAD } },
      },
    });

    expect(gitRuntime.reconcile).toHaveBeenCalledWith({
      rootPath: '/vault',
      repositoryId: current.repositoryId,
      repositoryFullName: current.observation!.repositoryFullName,
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
