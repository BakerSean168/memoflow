/**
 * Setting UI host facade (Issue #630 §4.9).
 *
 * `@memoflow/setting-ui` owns the Settings surfaces but must not import
 * `@memoflow/app-vue`, the AI/account/repository feature scopes or
 * `@memoflow/notification-ui`. Every capability that belongs to those owners is
 * declared here as a structural port and bound once by the renderer
 * composition root (`packages/app-vue/src/di/setting-ui-host.ts`).
 *
 * The interfaces describe exactly the members the surfaces consume; the host
 * keeps DI, server-state, i18n/theme synchronisation, keyboard runtime,
 * platform bridges and cross-domain facades.
 */
import type { Component, InjectionKey, Ref } from 'vue';
import type {
  AgentConversationSelection,
  AgentInstance,
  AgentRegistryCommand,
  AgentRegistrySnapshot,
  AIProviderConfigClientDTO,
  AIProviderModelCatalogSnapshot,
  CommitAIProviderOnboardingReq,
  CommitAIProviderReplacementReq,
  LocalAgentAuthState,
  LocalAgentConnection,
  LocalAgentDriver,
  LocalAgentStatus,
  ProbeAIProviderConnectionReq,
  ProbeAIProviderConnectionRes,
  ProbeAIProviderReplacementReq,
  TestAIProviderOnboardingModelReq,
  TestAIProviderOnboardingModelRes,
} from '@memoflow/contracts/ai';
import type {
  DesktopAccessSnapshot,
  DesktopNotificationPreference,
  DesktopNotificationPreferencePatch,
  DesktopUpdateDiagnosticsDTO,
  DesktopUpdateSnapshotDTO,
} from '@memoflow/contracts/electron';
import type { Result } from '@memoflow/contracts/result';
import type {
  CompleteKnowledgeRepositoryInstallationReq,
  CompleteKnowledgeRepositoryInstallationRes,
  CreateKnowledgeRepositoryConnectionReq,
  DisconnectKnowledgeRepositoryConnectionRes,
  ExecuteKnowledgeRepositoryReconciliationReq,
  ExecuteKnowledgeRepositoryReconciliationRes,
  KnowledgeRemoteBindingClientDTO,
  KnowledgeRepositoryInstallationIntentStatusResponse,
  KnowledgeRepositoryReconciliationPreview,
  ListKnowledgeRepositoryConnectionsRes,
  LocalVaultBindingSnapshotDTO,
  OpenLocalVaultInObsidianReq,
  SelectLocalVaultReq,
  StartKnowledgeRepositoryInstallationReq,
  StartKnowledgeRepositoryInstallationRes,
  SyncKnowledgeRepositoryReq,
  SyncKnowledgeRepositoryRes,
} from '@memoflow/repository-contracts';
import type { DeviceKeymap, KeyboardCommandId } from '@memoflow/desktop-contracts';
import type { SettingClientPort } from '@memoflow/setting-client';
import type { TimeFacade } from '@memoflow/time';

/** Renderer locales owned by the host i18n platform. */
export type SettingLocale = 'zh-CN' | 'en-US';

/** Shortcut scopes shared with the host keyboard runtime. */
export type SettingShortcutScope = 'app' | 'workspace' | 'preview' | 'list';

/** Host keyboard command projection (see `app-vue/src/shared/keyboard/commands.ts`). */
export interface SettingKeyboardCommand {
  id: KeyboardCommandId;
  title: string;
  scope: SettingShortcutScope;
  keys: readonly string[];
  repeat?: boolean;
  editable?: boolean;
}

/** Platform facts the keymap formatter needs. */
export interface SettingKeyboardHost {
  platform: 'mac' | 'windows' | 'linux';
  desktop: boolean;
}

/** Chord collision reported by the host keymap validator. */
export interface SettingKeymapConflict {
  chord: string;
  commands: string[];
}

/** Validation result of the host keymap validator. */
export interface SettingKeymapValidation {
  keymap: DeviceKeymap;
  conflicts: SettingKeymapConflict[];
}

/** Host shortcut engine surface consumed by the settings form. */
export interface SettingKeyboardEngine {
  host: SettingKeyboardHost;
  definitions: readonly SettingKeyboardCommand[];
  bindings(id: KeyboardCommandId): readonly string[];
}

/** Host keyboard runtime singleton. */
export interface SettingKeyboardRuntime {
  commands: Ref<SettingKeyboardCommand[]>;
  keymap: Ref<DeviceKeymap>;
  engine: SettingKeyboardEngine;
  recorder: Ref<((event: KeyboardEvent) => void) | null>;
  storageError: Ref<string | null>;
  applyKeymap(input: unknown): void;
}

/** Native (non-Mastra) agent transport consumed by the AI settings surfaces. */
export interface SettingLocalAgentPort {
  listConnections(): Promise<LocalAgentConnection[]>;
  probeConnection(id: string): Promise<LocalAgentStatus>;
  cachedCatalogConnection(id: string): Promise<LocalAgentStatus | null>;
  probeDefaultDriver(driver: LocalAgentDriver): Promise<LocalAgentStatus>;
  startLogin(connectionId: string): Promise<LocalAgentAuthState>;
  loginStatus(connectionId: string): Promise<LocalAgentAuthState>;
  cancelLogin(connectionId: string, flowId: string): Promise<LocalAgentAuthState>;
  completeLogin(
    connectionId: string,
    flowId: string,
    callbackUrl: string,
  ): Promise<LocalAgentAuthState>;
  signOut(connectionId: string): Promise<LocalAgentAuthState>;
}

/** Agent instance registry transport consumed by the AI settings surfaces. */
export interface SettingAgentRegistryPort {
  list(): Promise<AgentRegistrySnapshot>;
  execute(
    command: Exclude<AgentRegistryCommand, { action: 'list' }>,
  ): Promise<AgentInstance | AgentRegistrySnapshot | AgentConversationSelection | null>;
}

/** Renderer-only model visibility projection owned by the AI feature. */
export interface SettingNativeModelVisibility {
  canPersist: Readonly<Ref<boolean>>;
  isVisible(instanceId: string, modelId: string): boolean;
  setVisible(instanceId: string, modelId: string, visible: boolean): boolean;
}

/** AI provider facade owned by the AI feature (`useAI`). */
export interface SettingAiFacade {
  providers: Ref<AIProviderConfigClientDTO[]>;
  invalidateConfiguration(): void;
  loadProviders(): Promise<AIProviderConfigClientDTO[]>;
  probeProviderConnection(
    request: ProbeAIProviderConnectionReq,
  ): Promise<ProbeAIProviderConnectionRes>;
  probeProviderReplacement(
    providerId: string,
    request: ProbeAIProviderReplacementReq,
  ): Promise<ProbeAIProviderConnectionRes>;
  testProviderOnboardingModel(
    request: TestAIProviderOnboardingModelReq,
  ): Promise<TestAIProviderOnboardingModelRes>;
  commitProviderOnboarding(
    request: CommitAIProviderOnboardingReq,
  ): Promise<AIProviderConfigClientDTO>;
  commitProviderReplacement(
    providerId: string,
    request: CommitAIProviderReplacementReq,
  ): Promise<AIProviderConfigClientDTO>;
  refreshProviderModels(providerId: string): Promise<AIProviderModelCatalogSnapshot>;
}

/** Desktop bridge surface used by the ACP / import-export flows. */
export interface SettingDesktopBridge {
  invoke(channel: string, payload?: unknown): Promise<unknown>;
}

/** Desktop auth API surface used for file dialogs and window chrome. */
export interface SettingDesktopAuthApi {
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

/** Desktop update capability exposed to the settings surfaces. */
export interface SettingDesktopUpdateService {
  getDiagnostics(): Promise<Result<DesktopUpdateDiagnosticsDTO>>;
  getSnapshot(): Promise<Result<DesktopUpdateSnapshotDTO>>;
  check(): Promise<Result<DesktopUpdateSnapshotDTO>>;
  restartAndInstall(): Promise<Result<DesktopUpdateSnapshotDTO>>;
  subscribe(listener: (snapshot: DesktopUpdateSnapshotDTO) => void): () => void;
}

/** Data portability service surface used by the backup/restore section. */
export interface SettingDataPortabilityPort {
  exportPortableDataV3(payload: Record<string, never>): Promise<
    Result<{
      fileName: string;
      content: string;
      summary: { capabilityKeys: string[]; warnings: string[] };
    }>
  >;
  exportServerHeldDataDisclosure(payload: Record<string, never>): Promise<
    Result<{
      fileName: string;
      content: string;
      summary: { entityCounts: Record<string, number>; cachedAttachmentBytes: number };
    }>
  >;
  dryRunPortableDataV3(payload: { content: string }): Promise<Result<unknown>>;
  applyPortableDataV3(payload: { content: string }): Promise<
    Result<{
      created: Record<string, number>;
      updated: Record<string, number>;
      warnings: string[];
    }>
  >;
}

/** Knowledge repository / Local Vault surface owned by the repository scope. */
export interface SettingRepositoryServicePort {
  startKnowledgeRepositoryInstallation(
    request?: StartKnowledgeRepositoryInstallationReq,
  ): Promise<Result<StartKnowledgeRepositoryInstallationRes>>;
  completeKnowledgeRepositoryInstallation(
    request: CompleteKnowledgeRepositoryInstallationReq,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>>;
  getKnowledgeRepositoryInstallationIntentStatus(
    intentId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationIntentStatusResponse>>;
  finalizeKnowledgeRepositoryInstallationIntent(
    intentId: string,
  ): Promise<Result<CompleteKnowledgeRepositoryInstallationRes>>;
  listKnowledgeRepositoryConnections(): Promise<Result<ListKnowledgeRepositoryConnectionsRes>>;
  refreshKnowledgeRepositoryObservation(
    connectionId: string,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>>;
  connectKnowledgeRepository(
    request: CreateKnowledgeRepositoryConnectionReq,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>>;
  disconnectKnowledgeRepository(
    connectionId: string,
    purgeCloudData?: boolean,
  ): Promise<Result<DisconnectKnowledgeRepositoryConnectionRes>>;
  previewKnowledgeRepositoryReconciliation(
    connectionId: string,
  ): Promise<Result<KnowledgeRepositoryReconciliationPreview>>;
  executeKnowledgeRepositoryReconciliation(
    request: ExecuteKnowledgeRepositoryReconciliationReq,
  ): Promise<Result<ExecuteKnowledgeRepositoryReconciliationRes>>;
  syncKnowledgeRepository(
    request: SyncKnowledgeRepositoryReq,
  ): Promise<Result<SyncKnowledgeRepositoryRes>>;
  getLocalVaultBinding(): Promise<Result<LocalVaultBindingSnapshotDTO | null>>;
  selectLocalVault(
    request?: SelectLocalVaultReq,
  ): Promise<Result<LocalVaultBindingSnapshotDTO | null>>;
  detachLocalVault(): Promise<Result<void>>;
  openLocalVaultInObsidian(request: OpenLocalVaultInObsidianReq): Promise<Result<void>>;
}

/** Notification preference surface owned by `@memoflow/notification-ui`. */
export interface SettingNotificationPreferenceFacade {
  modules: readonly SettingNotificationPreferenceModule[];
  isLoading: Readonly<Ref<boolean>>;
  isSaving: Readonly<Ref<boolean>>;
  error: Readonly<Ref<string | null>>;
  hasChannel(moduleName: string, flag: SettingPreferenceChannelFlag): boolean;
  hasGlobalChannel(flag: SettingPreferenceChannelFlag): boolean;
  loadPreferences(): Promise<void>;
  setModuleChannel(
    moduleName: SettingNotificationPreferenceModule,
    flag: SettingPreferenceChannelFlag,
    enabled: boolean,
  ): Promise<boolean>;
  setGlobalChannel(flag: SettingPreferenceChannelFlag, enabled: boolean): Promise<boolean>;
}

export type SettingNotificationPreferenceModule =
  | 'task'
  | 'goal'
  | 'schedule'
  | 'reminder'
  | 'account'
  | 'system';

export type SettingPreferenceChannelFlag = 'inApp' | 'push' | 'email';

/** Browser system-notification presentation owned by `@memoflow/notification-ui`. */
export interface SettingBrowserNotificationFacade {
  permission(): SettingBrowserNotificationPermission;
  isEnabled(): boolean;
  isSupported(): boolean;
  requestPermission(): Promise<SettingBrowserNotificationPermission>;
  setEnabled(enabled: boolean): void;
}

export type SettingBrowserNotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported';

/** Shell scene controls the settings view drives. */
export interface SettingShellStore {
  settingsNavigationOpen: boolean;
  setSettingsNavigationOpen(open: boolean): void;
}

/** Renderer composition dependencies. */
export interface SettingUiHost {
  SETTING_SERVICE_KEY: InjectionKey<SettingClientPort>;
  DATA_PORTABILITY_SERVICE_KEY: InjectionKey<SettingDataPortabilityPort>;
  DESKTOP_AUTH_API_KEY: InjectionKey<SettingDesktopAuthApi>;
  DESKTOP_BRIDGE_KEY: InjectionKey<SettingDesktopBridge>;
  DESKTOP_ACCESS_SNAPSHOT_KEY: InjectionKey<Ref<DesktopAccessSnapshot | null>>;
  DESKTOP_NOTIFICATION_DEVICE_PREFERENCE_KEY: InjectionKey<SettingNotificationDevicePreferencePort>;
  DESKTOP_UPDATE_SERVICE_KEY: InjectionKey<SettingDesktopUpdateService>;
  AI_AGENT_REGISTRY_KEY: InjectionKey<SettingAgentRegistryPort>;
  AI_LOCAL_AGENT_KEY: InjectionKey<SettingLocalAgentPort>;
  AUTH_SERVICE_KEY: InjectionKey<SettingCloudAuthService>;
  EXTERNAL_AGENT_SERVICE_KEY: InjectionKey<SettingExternalAgentService>;

  REPOSITORY_SERVICE_KEY: InjectionKey<SettingRepositoryServicePort>;

  useStrictInject<T>(key: InjectionKey<T>, name?: string): T;
  createComposableHandleError(options: {
    t: (key: string, params?: Record<string, unknown>) => string;
    setError(message: string | null): void;
    report?(message: string): void;
  }): (error: unknown, fallbackKey: string) => void;
  sanitizeForIpc<T>(value: T): unknown;
  getGlobalResultErrorT(): (key: string, params?: Record<string, unknown>) => string;
  translateResultError(
    error: unknown,
    t: (key: string, params?: Record<string, unknown>) => string,
    options: { scope?: string; fallbackKey: string },
  ): string;
  normalizeSelectString(value: unknown): string | null;
  readDesktopAccessSnapshot(
    api?: SettingDesktopAuthApi,
    options?: { refreshCloud?: boolean },
  ): Promise<DesktopAccessSnapshot | null>;
  getDesktopAuthApi(target?: unknown): SettingDesktopAuthApi | undefined;
  setProductTimePreferences(preferences: Record<string, unknown>): void;
  getProductTime(): TimeFacade;
  setI18nLocale(locale: SettingLocale): Promise<void>;
  useServerStateIdentityScope(): () => string;

  keyboard: SettingKeyboardRuntime;
  eventChord(event: KeyboardEvent, host: SettingKeyboardHost): string | null;
  normalizeChord(chord: string, host: SettingKeyboardHost): string | null;
  displayChord(chord: string, host: SettingKeyboardHost): string;
  validateKeymap(input: unknown, host: SettingKeyboardHost): SettingKeymapValidation;
  saveDeviceKeymap(input: unknown): Promise<void>;

  useAiFacade(): SettingAiFacade;
  getAIErrorMessage(
    error: unknown,
    t: (key: string, params?: Record<string, unknown>) => string,
    fallbackKey: string,
  ): string;
  getNativeAgentExecutionFailureMessage(
    failure: unknown,
    t: (key: string, params?: Record<string, unknown>) => string,
  ): string;
  sortAgentInstances(instances: readonly AgentInstance[]): AgentInstance[];
  useNativeModelVisibility(
    resolveIdentity: () => string,
    resolveContext: () => string | undefined,
  ): SettingNativeModelVisibility;

  useNotificationPreferences(): SettingNotificationPreferenceFacade;
  browserNotification: SettingBrowserNotificationFacade;

  useAppShellStore(): SettingShellStore;
  returnFromSettingsScene(
    router: unknown,
    store: SettingShellStore,
    fullPath: string,
  ): Promise<unknown>;

  components: Record<
    | 'SettingsPropertyRow'
    | 'SettingsSection'
    | 'SettingsStatusBlock'
    | 'SettingsDangerZone'
    | 'SettingsDialogShell'
    | 'SettingsObjectCard'
    | 'ReleaseNotes'
    | 'ProductSurfaceHeader'
    | 'AgentDriverIcon'
    | 'AccountProfileSection'
    | 'CloudPasswordSection'
    | 'ExternalAgentConnectionsSection'
    | 'KnowledgeWriteRequestLedger',
    Component
  >;
}

/** Desktop notification device preference port. */
export interface SettingNotificationDevicePreferencePort {
  get(): Promise<Result<DesktopNotificationPreference>>;
  update(patch: DesktopNotificationPreferencePatch): Promise<Result<DesktopNotificationPreference>>;
  reset(): Promise<Result<DesktopNotificationPreference>>;
}

/** Cloud auth service projection used by the account section. */
export interface SettingCloudAuthService {
  [key: string]: unknown;
}

/** External agent service projection used by the account section. */
export interface SettingExternalAgentService {
  [key: string]: unknown;
}

// Bound once in the renderer composition root. Holds no user state: every member
// still consults the host's existing DI, i18n, keyboard and cache owners.
export let settingUiHost: SettingUiHost;
export function bindSettingUiHost(host: SettingUiHost): void {
  settingUiHost = host;
}
