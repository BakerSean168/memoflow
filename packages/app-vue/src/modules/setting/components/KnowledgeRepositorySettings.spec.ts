import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestPinia } from '@memoflow/test-utils';
import {
  ProfileAccessChannels,
  SystemChannels,
  type DesktopAccessSnapshot,
} from '@memoflow/contracts/electron';
import type { KnowledgeRemoteBindingClientDTO } from '@memoflow/contracts/repository';
import { fail, ok } from '@memoflow/contracts/result';
import { DESKTOP_BRIDGE_KEY, REPOSITORY_SERVICE_KEY } from '../../../di/keys';
import type { IRepositoryService } from '../../../di/types';
import KnowledgeRepositorySettings from './KnowledgeRepositorySettings.vue';

const routerMocks = vi.hoisted(() => ({
  query: {} as Record<string, string>,
  replace: vi.fn(async () => undefined),
  resolve: vi.fn(() => ({ href: '/settings?tab=repository' })),
}));
const confirmMock = vi.hoisted(() => vi.fn(async () => true));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routerMocks.query }),
  useRouter: () => ({ replace: routerMocks.replace, resolve: routerMocks.resolve }),
}));

vi.mock('@memoflow/ui-vue-shadcn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memoflow/ui-vue-shadcn')>()),
  useConfirm: confirmMock,
}));

const messages = {
  common: { cancel: 'Cancel', refresh: 'Refresh' },
  setting: {
    knowledgeRepository: {
      localTitle: 'Local Vault',
      localDescription: 'Local description',
      localDesktopOnly: 'Desktop only',
      githubTitle: 'GitHub Knowledge Repository',
      githubDescription: 'GitHub description',
      errorTitle: 'Error',
      permissionTitle: 'Least privilege',
      permissionDescription: 'Only selected repositories',
      chooseTitle: 'Choose repository',
      chooseDescription: 'Choose a private repository',
      private: 'Private',
      public: 'Public',
      connect: 'Connect',
      disconnect: 'Disconnect',
      connectAnother: 'Connect another',
      startConnect: 'Start connect',
      createPrivate: 'Create private repository',
      createOpenFailed: 'Create repository page failed',
      notConnected: 'Not connected',
      guestCloudBlocked: 'Guest mode is local-only.',
      offlineCloudBlocked: 'Sign in online first.',
      webConnectHint: 'Web connect hint',
      desktopConnectHint: 'Desktop connect hint',
      defaultBranch: 'Default branch: {branch}',
      lastConfirmedRemoteHead: 'Confirmed remote HEAD: {sha}',
      refreshProvider: 'Check GitHub status',
      refreshProviderFailed: 'Provider refresh failed',
      localRequiredBeforeConnect: 'Choose a Local Vault before connecting GitHub.',
      providerStatus: {
        Ready: 'Provider ready',
        Blocked: 'Provider blocked',
        Unchecked: 'Not checked',
      },
      providerBlockReason: {
        RepositoryPublic: 'Repository became public; sync paused.',
        unknown: 'Provider needs attention.',
      },
      projectionState: 'Projection: {state}',
      projectionStatus: {
        Ready: 'Ready',
        Lagging: 'Lagging',
        Rebuilding: 'Rebuilding',
        Failed: 'Failed',
        Unknown: 'No checkpoint yet',
      },
      loadFailed: 'Load failed',
      completeFailed: 'Complete failed',
      connectFailed: 'Connect failed',
      disconnectFailed: 'Disconnect failed',
      disconnectTitle: 'Disconnect?',
      disconnectDescription: 'Disconnect {repository}',
      purgeCloudData: 'Delete cloud projections',
      purgeCloudDataDescription: 'Deletes projected data and the AI index.',
      purgeLocalAndGithubPreserved: 'Local Vault and GitHub are preserved.',
      retainCloudDataDescription: 'Cloud projections are retained for reconnecting.',
      startFailed: 'Start failed',
      reconciliation: {
        preview: 'Check first sync',
        previewFailed: 'Preflight failed',
        execute: 'Run first sync',
        executeTitle: 'Run first sync?',
        executeDescription: '{action}',
        executeFailed: 'Execution failed',
        completed: 'Completed at {sha}',
        action: {
          InitializeRemoteFromLocal: 'Push local safely',
          CloneRemoteIntoLocal: 'Clone remote safely',
          InitializeBoth: 'Initialize both safely',
          ManualResolutionRequired: 'Manual resolution required',
        },
      },
      sync: {
        execute: 'Sync now',
        retry: 'Recheck sync',
        failed: 'Sync failed',
        conflictTitle: 'Conflict needs attention',
        conflictDescription: 'Resolve externally and recheck.',
        conflictLocalHead: 'Local HEAD: {sha}',
        conflictRemoteHead: 'Remote HEAD: {sha}',
        openInObsidian: 'Open conflict in Obsidian',
        openInObsidianFailed: 'Open conflict failed',
        pendingTitle: 'Local commit saved',
        pendingDescription: 'Pending upload at {sha}',
        outcome: {
          UpToDate: 'Up to date at {sha}',
          Pushed: 'Pushed at {sha}',
          Pulled: 'Pulled at {sha}',
          RebasedAndPushed: 'Rebased and pushed at {sha}',
        },
      },
    },
  },
};

const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': messages } });

const PassthroughStub = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.());
  },
});

const ButtonStub = defineComponent({
  props: ['disabled'],
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          disabled: props.disabled,
          onClick: () => emit('click'),
        },
        slots.default?.(),
      );
  },
});

const CheckboxStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('button', {
        ...attrs,
        type: 'button',
        'aria-pressed': props.modelValue,
        onClick: () => emit('update:modelValue', !props.modelValue),
      });
  },
});

function availableLocalVaultSnapshot() {
  const bindingId = 'LocalVaultBindingId_550e8400-e29b-41d4-a716-446655440000' as never;
  return {
    binding: {
      id: bindingId,
      knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440001' as never,
      localProfileId: 'registered-profile',
      rootPath: '/vault',
      displayName: 'Vault',
      boundAt: 1,
      detachedAt: null,
    },
    health: {
      bindingId,
      state: 'Available' as const,
      observedAt: 1,
      detail: null,
    },
  };
}

const REMOTE_BINDING_ID = 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440410' as never;
const KNOWLEDGE_SPACE_ID = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440001' as never;

function readyRemoteBinding(
  overrides: Partial<KnowledgeRemoteBindingClientDTO> = {},
): KnowledgeRemoteBindingClientDTO {
  const base: KnowledgeRemoteBindingClientDTO = {
    id: REMOTE_BINDING_ID,
    knowledgeSpaceId: KNOWLEDGE_SPACE_ID,
    identityId: 'IdentityId_11111111-1111-4111-8111-111111111111' as never,
    provider: 'GitHub',
    installationId: 'installation-1',
    repositoryId: 'repository-1',
    repositoryFullNameSnapshot: 'owner/knowledge',
    connectedAt: 1,
    disconnectedAt: null,
    observation: {
      bindingId: REMOTE_BINDING_ID,
      observedAt: 1,
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
    projectionCheckpoint: {
      bindingId: REMOTE_BINDING_ID,
      branch: 'main',
      projectedCommitSha: null,
      state: 'Lagging',
      failure: null,
      lastAttemptAt: null,
      projectedAt: null,
    },
  };
  return { ...base, ...overrides };
}

function createService(overrides: Partial<IRepositoryService> = {}): IRepositoryService {
  return {
    listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [] })),
    refreshKnowledgeRepositoryObservation: vi.fn(),
    completeKnowledgeRepositoryInstallation: vi.fn(),
    getKnowledgeRepositoryInstallationIntentStatus: vi.fn(),
    finalizeKnowledgeRepositoryInstallationIntent: vi.fn(),
    connectKnowledgeRepository: vi.fn(),
    disconnectKnowledgeRepository: vi.fn(),
    previewKnowledgeRepositoryReconciliation: vi.fn(),
    executeKnowledgeRepositoryReconciliation: vi.fn(),
    syncKnowledgeRepository: vi.fn(),
    openLocalVaultInObsidian: vi.fn(),
    startKnowledgeRepositoryInstallation: vi.fn(),
    getLocalVaultBinding: vi.fn(),
    selectLocalVault: vi.fn(),
    detachLocalVault: vi.fn(),
    listKnowledgeWriteRequests: vi.fn(async () => ok({ writeRequests: [] })),
    replayKnowledgeWriteRequestProjection: vi.fn(async () =>
      ok({ writeRequestId: 'write-request-1', commitSha: 'a'.repeat(40), status: 'Succeeded' }),
    ),
    ...overrides,
  } as unknown as IRepositoryService;
}

function mountSettings(
  service: IRepositoryService,
  desktopBridge?: { invoke: ReturnType<typeof vi.fn> },
  options?: { desktopAccess?: DesktopAccessSnapshot | null },
) {
  const pinia = createTestPinia();
  const defaultDesktopAccess: DesktopAccessSnapshot = {
    profile: {
      profileId: 'registered-profile',
      profileKind: 'registered',
      displayName: 'Local Profile',
      avatarSeed: 'registered-seed',
      identifierHint: 'user@example.com',
      cloudAccountId: 'account-1',
      lastActiveAt: 1,
      hasPin: false,
    },
    unlockState: 'UNLOCKED',
    cloudState: 'ONLINE',
    capabilities: { local: true, sync: true, cloudAi: true, repositoryConnection: true },
  };
  const desktopAccess =
    options?.desktopAccess === undefined ? defaultDesktopAccess : options.desktopAccess;
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      invoke: vi.fn(async (channel: string) => {
        if (channel !== ProfileAccessChannels.GET_SNAPSHOT) {
          throw new Error(`Unexpected IPC channel: ${channel}`);
        }
        return { ok: true, data: desktopAccess };
      }),
    },
  });
  return mount(KnowledgeRepositorySettings, {
    global: {
      plugins: [pinia, i18n],
      provide: {
        [REPOSITORY_SERVICE_KEY as symbol]: service,
        ...(desktopBridge ? { [DESKTOP_BRIDGE_KEY as symbol]: desktopBridge } : {}),
      },
      stubs: {
        Alert: PassthroughStub,
        AlertDescription: PassthroughStub,
        AlertTitle: PassthroughStub,
        Badge: PassthroughStub,
        Button: ButtonStub,
        Card: PassthroughStub,
        CardContent: PassthroughStub,
        CardDescription: PassthroughStub,
        CardHeader: PassthroughStub,
        CardTitle: PassthroughStub,
        Checkbox: CheckboxStub,
        Dialog: PassthroughStub,
        DialogContent: PassthroughStub,
        DialogDescription: PassthroughStub,
        DialogFooter: PassthroughStub,
        DialogHeader: PassthroughStub,
        DialogTitle: PassthroughStub,
        Label: PassthroughStub,
        AlertCircle: true,
        ExternalLink: true,
        FolderOpen: true,
        GitBranch: true,
        HardDrive: true,
        Link2: true,
        Loader2: true,
        Plus: true,
        RefreshCw: true,
        ShieldCheck: true,
        Unplug: true,
      },
    },
  });
}

describe('KnowledgeRepositorySettings', () => {
  beforeEach(() => {
    createTestPinia();
    routerMocks.query = {};
    routerMocks.replace.mockClear();
    confirmMock.mockClear();
    confirmMock.mockResolvedValue(true);
  });

  it('opens GitHub-hosted private repository creation without requesting broader OAuth access', async () => {
    const invoke = vi.fn(async () => ({ ok: true as const, data: { opened: true } }));
    const service = createService({
      getLocalVaultBinding: vi.fn(async () => ok(null)),
    });
    const wrapper = mountSettings(service, { invoke });
    await flushPromises();

    await wrapper.get('[data-testid="github-repository-create"]').trigger('click');
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith(SystemChannels.OPEN_EXTERNAL_URL, {
      url: 'https://github.com/new?name=memory-flow-notes&visibility=private',
    });
    expect(service.startKnowledgeRepositoryInstallation).not.toHaveBeenCalled();
  });

  it('opens GitHub-hosted private repository creation in a separate Web tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const service = createService();
    const wrapper = mountSettings(service);
    await flushPromises();

    await wrapper.get('[data-testid="github-repository-create"]').trigger('click');
    await flushPromises();

    expect(open).toHaveBeenCalledWith(
      'https://github.com/new?name=memory-flow-notes&visibility=private',
      '_blank',
      'noopener,noreferrer',
    );
    expect(service.startKnowledgeRepositoryInstallation).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('loads existing identity-scoped repository connections', async () => {
    const listKnowledgeRepositoryConnections = vi.fn(async () =>
      ok({
        connections: [readyRemoteBinding()],
      }),
    );
    const wrapper = mountSettings(createService({ listKnowledgeRepositoryConnections }));
    await flushPromises();

    expect(listKnowledgeRepositoryConnections).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('owner/knowledge');
    expect(wrapper.text()).toContain('Provider ready');
  });

  it('refreshes provider observation only after an explicit user action', async () => {
    const current = readyRemoteBinding();
    const refreshKnowledgeRepositoryObservation = vi.fn(async () =>
      ok(
        readyRemoteBinding({
          observation: { ...current.observation!, observedAt: 2 },
        }),
      ),
    );
    const wrapper = mountSettings(
      createService({
        listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [current] })),
        refreshKnowledgeRepositoryObservation,
      }),
    );
    await flushPromises();

    expect(refreshKnowledgeRepositoryObservation).not.toHaveBeenCalled();
    const refreshButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Check GitHub status'));
    expect(refreshButton).toBeDefined();
    await refreshButton!.trigger('click');
    await flushPromises();

    expect(refreshKnowledgeRepositoryObservation).toHaveBeenCalledWith(REMOTE_BINDING_ID);
  });

  it.each([
    ['retains rebuildable cloud data by default', false],
    ['purges cloud projections only after the user selects the option', true],
  ])('%s when disconnecting', async (_label, purgeCloudData) => {
    const connection = readyRemoteBinding();
    const listKnowledgeRepositoryConnections = vi
      .fn()
      .mockResolvedValueOnce(ok({ connections: [connection] }))
      .mockResolvedValue(ok({ connections: [] }));
    const disconnectKnowledgeRepository = vi.fn(async () => ok(null));
    const wrapper = mountSettings(
      createService({ listKnowledgeRepositoryConnections, disconnectKnowledgeRepository }),
    );
    await flushPromises();

    const disconnectButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Disconnect');
    expect(disconnectButton).toBeDefined();
    await disconnectButton!.trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="knowledge-repository-disconnect-dialog"]').text()).toContain(
      'owner/knowledge',
    );
    if (purgeCloudData) {
      await wrapper.get('[data-testid="knowledge-repository-purge-cloud-data"]').trigger('click');
      await flushPromises();
      expect(wrapper.text()).toContain('Local Vault and GitHub are preserved.');
    } else {
      expect(wrapper.text()).toContain('Cloud projections are retained for reconnecting.');
    }

    await wrapper.get('[data-testid="knowledge-repository-confirm-disconnect"]').trigger('click');
    await flushPromises();

    expect(disconnectKnowledgeRepository).toHaveBeenCalledWith(REMOTE_BINDING_ID, purgeCloudData);
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('finalizes the durable Web installation intent before offering repository selection', async () => {
    routerMocks.query = {
      tab: 'repository',
      installation_intent: 'intent-1',
    };
    const getKnowledgeRepositoryInstallationIntentStatus = vi.fn(async () =>
      ok({
        intentId: 'intent-1',
        status: 'CallbackReceived' as const,
        clientKind: 'web' as const,
        expiresAt: Date.now() + 600_000,
        installationId: 'installation-1',
      }),
    );
    const finalizeKnowledgeRepositoryInstallationIntent = vi.fn(async () =>
      ok({
        installationId: 'installation-1',
        githubAccountId: '42',
        returnUrl: 'https://app.example.test/settings?tab=repository',
        repositories: [
          {
            id: 'repository-1',
            nodeId: 'R_1',
            fullName: 'owner/knowledge',
            ownerId: '42',
            private: true,
            archived: false,
            disabled: false,
            defaultBranch: 'main',
            permissions: { admin: false, push: true, pull: true },
          },
        ],
      }),
    );
    const service = createService({
      getKnowledgeRepositoryInstallationIntentStatus,
      finalizeKnowledgeRepositoryInstallationIntent,
    });
    const wrapper = mountSettings(service);
    await flushPromises();

    expect(getKnowledgeRepositoryInstallationIntentStatus).toHaveBeenCalledWith('intent-1');
    expect(finalizeKnowledgeRepositoryInstallationIntent).toHaveBeenCalledWith('intent-1');
    expect(wrapper.text()).toContain('owner/knowledge');
    expect(routerMocks.replace).toHaveBeenCalledWith({ query: { tab: 'repository' } });
    expect(service.completeKnowledgeRepositoryInstallation).not.toHaveBeenCalled();
  });

  it('completes Desktop installation through external browser polling without a Web callback session', async () => {
    const invoke = vi.fn(async () => ({ ok: true as const, data: { opened: true } }));
    const startKnowledgeRepositoryInstallation = vi.fn(async () =>
      ok({
        intentId: 'intent-desktop-1',
        installationUrl:
          'https://github.com/apps/memoflow/installations/new?state=mfi1.dev.desktop',
        expiresAt: Date.now() + 600_000,
        requiresExternalBrowser: true,
      }),
    );
    const getKnowledgeRepositoryInstallationIntentStatus = vi.fn(async () =>
      ok({
        intentId: 'intent-desktop-1',
        status: 'CallbackReceived' as const,
        clientKind: 'desktop' as const,
        expiresAt: Date.now() + 600_000,
        installationId: 'installation-1',
      }),
    );
    const finalizeKnowledgeRepositoryInstallationIntent = vi.fn(async () =>
      ok({
        installationId: 'installation-1',
        githubAccountId: '42',
        returnUrl: 'https://app.example.test/settings?tab=repository',
        repositories: [
          {
            id: 'repository-1',
            nodeId: 'R_1',
            fullName: 'owner/knowledge',
            ownerId: '42',
            private: true,
            archived: false,
            disabled: false,
            defaultBranch: 'main',
            permissions: { admin: false, push: true, pull: true },
          },
        ],
      }),
    );
    const connectKnowledgeRepository = vi.fn(async () => ok(readyRemoteBinding()));
    const wrapper = mountSettings(
      createService({
        startKnowledgeRepositoryInstallation,
        getKnowledgeRepositoryInstallationIntentStatus,
        finalizeKnowledgeRepositoryInstallationIntent,
        connectKnowledgeRepository,
        getLocalVaultBinding: vi.fn(async () => ok(availableLocalVaultSnapshot())),
      }),
      { invoke },
    );
    await flushPromises();

    await wrapper.get('[data-testid="github-repository-connect"]').trigger('click');
    await flushPromises();

    expect(startKnowledgeRepositoryInstallation).toHaveBeenCalledWith({
      returnUrl: undefined,
      clientKind: 'desktop',
    });
    expect(invoke).toHaveBeenCalledWith(SystemChannels.OPEN_EXTERNAL_URL, {
      url: expect.stringContaining('github.com/apps/memoflow/installations/new'),
    });
    expect(getKnowledgeRepositoryInstallationIntentStatus).toHaveBeenCalledWith('intent-desktop-1');
    expect(finalizeKnowledgeRepositoryInstallationIntent).toHaveBeenCalledWith('intent-desktop-1');
    expect(wrapper.text()).toContain('owner/knowledge');

    const repositoryConnectButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Connect');
    expect(repositoryConnectButton).toBeDefined();
    await repositoryConnectButton!.trigger('click');
    await flushPromises();

    expect(connectKnowledgeRepository).toHaveBeenCalledWith({
      installationId: 'installation-1',
      githubRepositoryId: 'repository-1',
      knowledgeSpaceId: KNOWLEDGE_SPACE_ID,
    });
  });

  it('resumes a verified Desktop installation without reopening GitHub', async () => {
    const invoke = vi.fn(async () => ({ ok: true as const, data: { opened: true } }));
    const startKnowledgeRepositoryInstallation = vi.fn(async () =>
      ok({
        intentId: 'intent-desktop-resumed',
        installationUrl: 'https://github.com/apps/memoflow/installations/new',
        expiresAt: Date.now() + 600_000,
        requiresExternalBrowser: false,
      }),
    );
    const getKnowledgeRepositoryInstallationIntentStatus = vi.fn(async () =>
      ok({
        intentId: 'intent-desktop-resumed',
        status: 'CallbackReceived' as const,
        clientKind: 'desktop' as const,
        expiresAt: Date.now() + 600_000,
        installationId: 'installation-1',
      }),
    );
    const finalizeKnowledgeRepositoryInstallationIntent = vi.fn(async () =>
      ok({
        installationId: 'installation-1',
        githubAccountId: '42',
        returnUrl: 'https://app.example.test/settings?tab=repository',
        repositories: [
          {
            id: 'repository-1',
            nodeId: 'R_1',
            fullName: 'owner/thought-forest',
            ownerId: '42',
            private: true,
            archived: false,
            disabled: false,
            defaultBranch: 'main',
            permissions: { admin: false, push: true, pull: true },
          },
        ],
      }),
    );
    const wrapper = mountSettings(
      createService({
        startKnowledgeRepositoryInstallation,
        getKnowledgeRepositoryInstallationIntentStatus,
        finalizeKnowledgeRepositoryInstallationIntent,
        getLocalVaultBinding: vi.fn(async () => ok(null)),
      }),
      { invoke },
    );
    await flushPromises();

    await wrapper.get('[data-testid="github-repository-connect"]').trigger('click');
    await flushPromises();

    expect(invoke).not.toHaveBeenCalledWith(SystemChannels.OPEN_EXTERNAL_URL, expect.anything());
    expect(getKnowledgeRepositoryInstallationIntentStatus).toHaveBeenCalledWith(
      'intent-desktop-resumed',
    );
    expect(finalizeKnowledgeRepositoryInstallationIntent).toHaveBeenCalledWith(
      'intent-desktop-resumed',
    );
    expect(wrapper.text()).toContain('owner/thought-forest');
  });

  it('recovers the Desktop UI when opening the external GitHub installation page fails', async () => {
    const invoke = vi.fn(async () => {
      throw new Error('shell open failed');
    });
    const startKnowledgeRepositoryInstallation = vi.fn(async () =>
      ok({
        intentId: 'intent-desktop-failed-open',
        installationUrl:
          'https://github.com/apps/memoflow/installations/new?state=mfi1.dev.desktop',
        expiresAt: Date.now() + 600_000,
        requiresExternalBrowser: true,
      }),
    );
    const getKnowledgeRepositoryInstallationIntentStatus = vi.fn();
    const wrapper = mountSettings(
      createService({
        startKnowledgeRepositoryInstallation,
        getKnowledgeRepositoryInstallationIntentStatus,
        getLocalVaultBinding: vi.fn(async () => ok(null)),
      }),
      { invoke },
    );
    await flushPromises();

    await wrapper.get('[data-testid="github-repository-connect"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Start failed');
    expect(getKnowledgeRepositoryInstallationIntentStatus).not.toHaveBeenCalled();
    expect(
      wrapper.get('[data-testid="github-repository-connect"]').attributes('disabled'),
    ).toBeUndefined();
  });

  it('completes the GitHub callback and connects a Contents-write repository without admin permission', async () => {
    routerMocks.query = {
      tab: 'repository',
      state: 'state-state-state-state',
      installation_id: 'installation-1',
      setup_action: 'install',
    };
    const completeKnowledgeRepositoryInstallation = vi.fn(async () =>
      ok({
        installationId: 'installation-1',
        githubAccountId: '42',
        returnUrl: 'https://app.example.test/settings?tab=repository',
        repositories: [
          {
            id: 'repository-1',
            nodeId: 'R_1',
            fullName: 'owner/knowledge',
            ownerId: '42',
            private: true,
            archived: false,
            disabled: false,
            defaultBranch: 'main',
            permissions: { admin: false, push: true, pull: true },
          },
        ],
      }),
    );
    const connectKnowledgeRepository = vi.fn(async () => ok(readyRemoteBinding()));
    const wrapper = mountSettings(
      createService({
        completeKnowledgeRepositoryInstallation,
        connectKnowledgeRepository,
      }),
    );
    await flushPromises();

    expect(completeKnowledgeRepositoryInstallation).toHaveBeenCalledWith({
      state: 'state-state-state-state',
      installationId: 'installation-1',
      setupAction: 'install',
    });
    expect(routerMocks.replace).toHaveBeenCalled();
    expect(wrapper.text()).toContain('owner/knowledge');

    const connectButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Connect'));
    expect(connectButton).toBeDefined();
    await connectButton!.trigger('click');
    await flushPromises();

    expect(connectKnowledgeRepository).toHaveBeenCalledWith({
      installationId: 'installation-1',
      githubRepositoryId: 'repository-1',
    });
  });

  it('previews the four-way first reconciliation only when Desktop has an active Vault', async () => {
    const connection = readyRemoteBinding();
    const previewKnowledgeRepositoryReconciliation = vi.fn(async () =>
      ok({
        connectionId: REMOTE_BINDING_ID,
        localState: 'NonEmpty' as const,
        remoteState: 'NonEmpty' as const,
        action: 'ManualResolutionRequired' as const,
        defaultBranch: 'main',
        remoteHeadSha: 'remote-head-sha',
      }),
    );
    const wrapper = mountSettings(
      createService({
        listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [connection] })),
        getLocalVaultBinding: vi.fn(async () => ok(availableLocalVaultSnapshot())),
        previewKnowledgeRepositoryReconciliation,
      }),
      { invoke: vi.fn() },
    );
    await flushPromises();

    const previewButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Check first sync'));
    expect(previewButton).toBeDefined();
    await previewButton!.trigger('click');
    await flushPromises();

    expect(previewKnowledgeRepositoryReconciliation).toHaveBeenCalledWith(REMOTE_BINDING_ID);
    expect(wrapper.get('[data-testid="reconciliation-preview"]').text()).toContain(
      'Manual resolution required',
    );
  });

  it('executes only the immutable safe preview after explicit confirmation', async () => {
    const connection = readyRemoteBinding();
    const previewKnowledgeRepositoryReconciliation = vi.fn(async () =>
      ok({
        connectionId: REMOTE_BINDING_ID,
        localState: 'NonEmpty' as const,
        remoteState: 'Empty' as const,
        action: 'InitializeRemoteFromLocal' as const,
        defaultBranch: 'main',
        remoteHeadSha: null,
      }),
    );
    const headSha = 'c'.repeat(40);
    const executeKnowledgeRepositoryReconciliation = vi.fn(async () =>
      ok({
        connection: {
          ...connection,
          historyFence: {
            bindingId: REMOTE_BINDING_ID,
            defaultBranch: 'main',
            lastConfirmedRemoteHeadSha: headSha,
            confirmedAt: 2,
          },
        },
        action: 'InitializeRemoteFromLocal' as const,
        headSha,
        reusedExistingSynchronization: false,
      }),
    );
    const wrapper = mountSettings(
      createService({
        listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [connection] })),
        getLocalVaultBinding: vi.fn(async () => ok(availableLocalVaultSnapshot())),
        previewKnowledgeRepositoryReconciliation,
        executeKnowledgeRepositoryReconciliation,
      }),
      { invoke: vi.fn() },
    );
    await flushPromises();

    const previewButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Check first sync'))!;
    await previewButton.trigger('click');
    await flushPromises();
    const executeButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Run first sync'))!;
    await executeButton.trigger('click');
    await flushPromises();

    expect(confirmMock).toHaveBeenCalledOnce();
    expect(executeKnowledgeRepositoryReconciliation).toHaveBeenCalledWith({
      connectionId: REMOTE_BINDING_ID,
      expectedAction: 'InitializeRemoteFromLocal',
      expectedDefaultBranch: 'main',
      expectedRemoteHeadSha: null,
    });
    expect(wrapper.get('[data-testid="reconciliation-completed"]').text()).toContain(
      headSha.slice(0, 8),
    );
  });

  it('runs continuous sync only for a reconciled Desktop connection', async () => {
    const previousHead = 'a'.repeat(40);
    const nextHead = 'b'.repeat(40);
    const connection = readyRemoteBinding({
      historyFence: {
        bindingId: REMOTE_BINDING_ID,
        defaultBranch: 'main',
        lastConfirmedRemoteHeadSha: previousHead,
        confirmedAt: 1,
      },
    });
    const syncKnowledgeRepository = vi.fn(async () =>
      ok({
        connection: {
          ...connection,
          historyFence: {
            ...connection.historyFence!,
            lastConfirmedRemoteHeadSha: nextHead,
            confirmedAt: 2,
          },
        },
        outcome: 'Pushed' as const,
        headSha: nextHead,
        localCommitCreated: true,
        remoteChangesApplied: false,
        pushed: true,
      }),
    );
    const wrapper = mountSettings(
      createService({
        listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [connection] })),
        getLocalVaultBinding: vi.fn(async () => ok(availableLocalVaultSnapshot())),
        syncKnowledgeRepository,
      }),
      { invoke: vi.fn() },
    );
    await flushPromises();

    const syncButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Sync now'))!;
    await syncButton.trigger('click');
    await flushPromises();

    expect(syncKnowledgeRepository).toHaveBeenCalledWith({ connectionId: connection.id });
    expect(wrapper.get('[data-testid="knowledge-repository-sync-completed"]').text()).toContain(
      nextHead.slice(0, 8),
    );
    expect(wrapper.text()).not.toContain('Check first sync');

    syncKnowledgeRepository.mockResolvedValueOnce(
      fail({
        code: 'SERVICE_UNAVAILABLE',
        message: 'GitHub offline',
        context: {
          localHeadSha: nextHead,
          localCommitCreated: true,
          uploadPending: true,
        },
      }) as never,
    );
    await syncButton.trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="knowledge-repository-sync-pending"]').text()).toContain(
      nextHead.slice(0, 8),
    );
    expect(wrapper.text()).toContain('Recheck sync');
  });

  it('shows preserved rebase conflicts and offers a recheck action', async () => {
    const head = 'a'.repeat(40);
    const connection = readyRemoteBinding({
      historyFence: {
        bindingId: REMOTE_BINDING_ID,
        defaultBranch: 'main',
        lastConfirmedRemoteHeadSha: head,
        confirmedAt: 1,
      },
    });
    const openLocalVaultInObsidian = vi.fn(async () => ok(undefined));
    const wrapper = mountSettings(
      createService({
        listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [connection] })),
        getLocalVaultBinding: vi.fn(async () => ok(availableLocalVaultSnapshot())),
        syncKnowledgeRepository: vi.fn(async () =>
          fail({
            code: 'CONFLICT',
            message: 'Rebase conflict',
            context: {
              localHeadSha: head,
              remoteHeadSha: 'b'.repeat(40),
              conflictingPaths: ['notes/shared.md'],
              rebaseInProgress: true,
            },
          }),
        ),
        openLocalVaultInObsidian,
      }),
      { invoke: vi.fn() },
    );
    await flushPromises();

    const syncButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Sync now'))!;
    await syncButton.trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="knowledge-repository-sync-conflict"]').text()).toContain(
      'notes/shared.md',
    );
    expect(wrapper.get('[data-testid="knowledge-repository-sync-conflict"]').text()).toContain(
      `Local HEAD: ${head.slice(0, 8)}`,
    );
    expect(wrapper.get('[data-testid="knowledge-repository-sync-conflict"]').text()).toContain(
      `Remote HEAD: ${'b'.repeat(8)}`,
    );
    expect(wrapper.text()).toContain('Recheck sync');
    await wrapper.get('[data-testid="knowledge-repository-open-conflict"]').trigger('click');
    await flushPromises();
    expect(openLocalVaultInObsidian).toHaveBeenCalledWith({
      relativePath: 'notes/shared.md',
    });
  });

  it('shows provider diagnostics and disables sync for a blocked repository', async () => {
    const connection = readyRemoteBinding({
      observation: {
        ...readyRemoteBinding().observation!,
        private: false,
        eligibility: { state: 'Blocked', reason: 'RepositoryPublic' },
      },
      historyFence: {
        bindingId: REMOTE_BINDING_ID,
        defaultBranch: 'main',
        lastConfirmedRemoteHeadSha: 'a'.repeat(40),
        confirmedAt: 1,
      },
    });
    const wrapper = mountSettings(
      createService({
        listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [connection] })),
        getLocalVaultBinding: vi.fn(async () => ok(availableLocalVaultSnapshot())),
      }),
      { invoke: vi.fn() },
    );
    await flushPromises();

    expect(wrapper.get('[data-testid="knowledge-repository-provider-diagnostic"]').text()).toBe(
      'Repository became public; sync paused.',
    );
    expect(wrapper.text()).not.toContain('Sync now');
  });
  it('hides GitHub connect actions and skips cloud listing for guest profiles', async () => {
    const service = createService();
    const wrapper = mountSettings(service, undefined, {
      desktopAccess: {
        profile: {
          profileId: 'guest-profile',
          profileKind: 'guest',
          displayName: 'Guest 4827',
          avatarSeed: 'guest-seed',
          identifierHint: null,
          cloudAccountId: null,
          lastActiveAt: 1,
          hasPin: false,
        },
        unlockState: 'UNLOCKED',
        cloudState: 'UNBOUND',
        capabilities: { local: true, sync: false, cloudAi: false, repositoryConnection: false },
      },
    });
    await flushPromises();

    expect(service.listKnowledgeRepositoryConnections).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Guest mode is local-only.');
    expect(wrapper.find('[data-testid="github-repository-connect"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="github-repository-create"]').exists()).toBe(false);
  });

  it('does not start GitHub App installation for offline-only profiles', async () => {
    const service = createService({
      startKnowledgeRepositoryInstallation: vi.fn(async () =>
        ok({ installationUrl: 'https://github.com/apps/memoflow/installations/new', expiresAt: 1 }),
      ),
    });
    const wrapper = mountSettings(service, undefined, {
      desktopAccess: {
        profile: {
          profileId: 'registered-profile',
          profileKind: 'registered',
          displayName: 'Local Profile',
          avatarSeed: 'registered-seed',
          identifierHint: 'user@example.com',
          cloudAccountId: 'account-1',
          lastActiveAt: 1,
          hasPin: false,
        },
        unlockState: 'UNLOCKED',
        cloudState: 'REAUTH_REQUIRED',
        capabilities: { local: true, sync: false, cloudAi: false, repositoryConnection: false },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Sign in online first.');
    expect(wrapper.find('[data-testid="github-repository-connect"]').exists()).toBe(false);
    expect(service.startKnowledgeRepositoryInstallation).not.toHaveBeenCalled();
  });
});
