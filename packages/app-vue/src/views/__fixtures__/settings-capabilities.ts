import { onBeforeUnmount, provide, ref } from 'vue';
import { ok } from '@memoflow/transport-contracts/result';
import type {
  AgentInstance,
  LocalAgentConnection,
  LocalAgentStatus,
  PermissionCommand,
  PermissionSnapshot,
} from '@memoflow/ai-contracts';
import type { DesktopStartupSnapshot, DesktopUpdateSnapshotDTO } from '@memoflow/desktop-contracts';
import {
  settingUiHost,
  type SettingNotificationPreferenceFacade,
  type SettingComposerDefaultsPort,
} from '@memoflow/setting-ui/host';

/** In-memory capabilities for the full settings stories. No live service is contacted. */
export function provideSettingsCapabilities(): void {
  const originalAi = settingUiHost.useAiFacade;
  const originalNotifications = settingUiHost.useNotificationPreferences;
  const providers = ref([]);
  let composerDefault: ReturnType<SettingComposerDefaultsPort['readNewSessionDefault']> = {
    enabled: false,
    selection: null,
  };
  const unavailableProvider = async (): Promise<never> => {
    throw new Error('This Storybook example uses local providers only.');
  };
  settingUiHost.useAiFacade = () => ({
    providers,
    loadProviders: async () => providers.value,
    invalidateConfiguration: () => undefined,
    probeProviderConnection: unavailableProvider,
    probeProviderReplacement: unavailableProvider,
    testProviderOnboardingModel: unavailableProvider,
    commitProviderOnboarding: unavailableProvider,
    commitProviderReplacement: unavailableProvider,
    refreshProviderModels: unavailableProvider,
    composerDefaults: {
      readNewSessionDefault: () => composerDefault,
      writeNewSessionDefault: (value: typeof composerDefault) => {
        composerDefault = value;
      },
      readStickySelection: () => null,
    },
  });

  const desktopNotifications = ref(true);
  const channels = ref<Record<string, boolean>>({
    task: true,
    goal: true,
    routine: false,
    account: true,
    system: true,
  });
  const notificationFacade: SettingNotificationPreferenceFacade = {
    modules: ['task', 'goal', 'routine', 'account', 'system'],
    isLoaded: ref(true),
    isLoading: ref(false),
    isSaving: ref(false),
    error: ref(null),
    loadPreferences: async () => undefined,
    hasGlobalChannel: () => desktopNotifications.value,
    hasChannel: (module) => channels.value[module] ?? false,
    setGlobalChannel: async (_channel, enabled) => {
      desktopNotifications.value = enabled;
      return true;
    },
    setModuleChannel: async (module, _channel, enabled) => {
      channels.value[module] = enabled;
      return true;
    },
  };
  settingUiHost.useNotificationPreferences = () => notificationFacade;
  onBeforeUnmount(() => {
    settingUiHost.useAiFacade = originalAi;
    settingUiHost.useNotificationPreferences = originalNotifications;
  });

  let startup: DesktopStartupSnapshot = {
    autoLaunch: { available: true, enabled: true },
    startHidden: false,
    closeToTray: true,
  };
  provide(settingUiHost.DESKTOP_STARTUP_SERVICE_KEY, {
    get: async () => ok(structuredClone(startup)),
    update: async (patch) => {
      startup = {
        ...startup,
        ...patch,
        autoLaunch: {
          ...startup.autoLaunch,
          enabled: patch.autoLaunch ?? startup.autoLaunch.enabled,
        },
      };
      return ok({ success: true, snapshot: structuredClone(startup) });
    },
    subscribe: () => () => undefined,
  });
  const updates: DesktopUpdateSnapshotDTO = {
    state: { type: 'idle', currentVersion: '0.23.0', lastCheckedAt: null, lastOutcome: null },
    currentVersion: '0.23.0',
    channel: 'stable',
    owner: 'memoflow-direct',
    capabilities: {
      canCheck: true,
      canBackgroundCheck: true,
      canDownload: true,
      canSelfInstall: true,
      canAutoDownload: true,
      installAuthority: 'memoflow',
    },
  };
  provide(settingUiHost.DESKTOP_UPDATE_SERVICE_KEY, {
    getSnapshot: async () => ok(updates),
    getDiagnostics: async () =>
      ok({
        currentVersion: updates.currentVersion,
        targetVersion: null,
        owner: updates.owner,
        capabilities: updates.capabilities,
        feedClass: 'github',
        lastCheckedAt: null,
        lastCheckResult: null,
        state: 'idle',
        failure: null,
        installReceipt: { status: 'none', requestedAt: null },
      }),
    check: async () => ok(updates),
    restartAndInstall: async () => ok(updates),
    subscribe: () => () => undefined,
  });
  provide(settingUiHost.DATA_PORTABILITY_SERVICE_KEY, {
    exportPortableDataV3: async () =>
      ok({
        fileName: 'memoflow-backup.json',
        content: '{}',
        summary: { entityCounts: {}, capabilityKeys: ['tasks', 'goals'], warnings: [] },
      }),
    exportServerHeldDataDisclosure: async () =>
      ok({
        fileName: 'memoflow-server-data.json',
        content: '{}',
        summary: { entityCounts: {}, cachedAttachmentBytes: 0 },
      }),
    dryRunPortableDataV3: async () => ok({ created: {}, updated: {} }),
    applyPortableDataV3: async () => ok({ created: {}, updated: {}, warnings: [] }),
  } as never);

  const now = Date.UTC(2026, 10, 26, 8);
  const instances: AgentInstance[] = [
    {
      instanceId: 'codex-work',
      driver: 'codex',
      name: 'Codex',
      accentColor: '#6469da',
      enabled: true,
      legacyConnectionId: 'codex-demo',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      instanceId: 'claude-work',
      driver: 'claude',
      name: 'Claude Code',
      accentColor: '#d97757',
      enabled: false,
      legacyConnectionId: 'claude-demo',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    },
  ] as AgentInstance[];
  const connections: LocalAgentConnection[] = instances.map((instance) => ({
    id: instance.legacyConnectionId!,
    driver: instance.driver,
    instanceSlug: instance.instanceId,
    name: instance.name,
    accentColor: instance.accentColor,
    enabled: instance.enabled,
    executablePath: instance.driver,
    homePath: '/demo/profile',
    writeScopes: [],
    nativePermissionMode: 'supervised',
    revision: 1,
    createdAt: now,
    updatedAt: now,
  })) as LocalAgentConnection[];
  const ready: LocalAgentStatus = {
    status: 'ready',
    version: '1.0.0',
    account: { type: 'chatgpt', email: 'demo@example.com' },
    models: [{ id: 'demo-model', name: 'Demo model' }],
  };
  provide(settingUiHost.AI_AGENT_REGISTRY_KEY, {
    list: async () => ({ instances: structuredClone(instances), bindings: [] }),
    execute: async (command) => {
      if (command.action === 'update') {
        const instance = instances.find((item) => item.instanceId === command.instanceId);
        if (instance) Object.assign(instance, command.patch);
        return instance ?? null;
      }
      return null;
    },
  });
  let permissions: PermissionSnapshot = {
    settings: { preset: 'confirm_each', agentPresets: {}, revision: 1, bulkThreshold: 25 },
    rules: [],
    audit: [],
  };
  provide(settingUiHost.AI_LOCAL_AGENT_KEY, {
    listConnections: async () => structuredClone(connections),
    cachedCatalogConnection: async () => structuredClone(ready),
    probeConnection: async () => structuredClone(ready),
    probeDefaultDriver: async () => structuredClone(ready),
    permissions: async (command: PermissionCommand) => {
      if (command.action === 'settings')
        permissions = { ...permissions, settings: command.settings };
      return structuredClone(permissions);
    },
    getMcpEndpoint: async () => ({
      url: 'http://127.0.0.1:4123/mcp',
      discoveryPath: '/demo/local-mcp.json',
    }),
    listMcpClients: async () => [],
    listGatewayAudit: async () => [],
  } as never);
}
