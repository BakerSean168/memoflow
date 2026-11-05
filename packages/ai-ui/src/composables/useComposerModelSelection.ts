import {
  AIChatPermissionModeSchema,
  AGENT_SUPPORTED_RUNTIME_MODES,
  resolveCompatibleRuntimeMode,
} from '@memoflow/ai-contracts';
import { computed, onActivated, ref, watch, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import type {
  AIChatPermissionMode,
  AIProviderConfigClientDTO,
  LocalAgentModelOptions,
} from '@memoflow/ai-contracts';
import type { AgentRegistryClient, LocalAgentClient } from '@memoflow/ai-client';
import { composerAgentKey, type useAIModelCatalog } from './useAIModelCatalog';
import { sortAgentInstances } from '../agent-instance-order';
import { antigravityEffortVariant, presentAntigravityModels } from './antigravityModelPresentation';
import { getAIErrorMessage } from './error';
import { useAIModelSelection } from './useAIModelSelection';
import type { useAIChatSession } from './useAIChatSession';
import type { useLocalAssistantChoices } from './useLocalAssistantChoices';
import type { ProviderListItem } from './types';

/**
 * Composer model selection and capability validation extracted from useAIChatView.ts
 * to reduce composable size. Owns the native model options, the Agent/Model catalog
 * projections and the permission mode; call and timing semantics stay owner-identical.
 */
export interface UseComposerModelSelectionOptions {
  providers: Ref<AIProviderConfigClientDTO[]>;
  loadProviders: () => Promise<AIProviderConfigClientDTO[]>;
  resolveIdentity: () => string;
  catalog: ReturnType<typeof useAIModelCatalog>;
  localAgent?: LocalAgentClient;
  agentRegistryClient?: AgentRegistryClient;
  configurationRevision?: Ref<number>;
  chatSession: Pick<
    ReturnType<typeof useAIChatSession>,
    'runtimeChoice' | 'chatLoading' | 'chatConversationId' | 'chatTimeline'
  >;
  localChoices: ReturnType<typeof useLocalAssistantChoices>;
  /** Late-bound reader; the caller computes the lock after the workflow composables exist. */
  isWorkflowSelectionLocked: () => boolean;
}

export function useComposerModelSelection(options: UseComposerModelSelectionOptions) {
  const { t } = useI18n();
  const route = useRoute();
  const {
    providers,
    loadProviders,
    resolveIdentity,
    catalog,
    localAgent,
    agentRegistryClient,
    configurationRevision,
    chatSession,
    localChoices,
    isWorkflowSelectionLocked,
  } = options;
  const agentRegistrySnapshot = catalog.snapshot;
  const modelCatalog = catalog.entries;
  const modelCatalogLoading = catalog.loading;
  const loadAgentRegistry = () => catalog.refresh();
  const permissionMode = ref<AIChatPermissionMode>('approval-required');
  const nativeModelSelections = ref<Record<string, LocalAgentModelOptions>>({});
  const composerInitializing = ref(true);
  const nativeSelectionPending = ref(false);
  let explicitRuntimeSelection = 0;
  let newThreadSelectionEpoch = 0;
  let disposed = false;
  const composerLoading = computed(
    () =>
      nativeSelectionPending.value ||
      composerInitializing.value ||
      (!agentRegistrySnapshot.value && modelCatalogLoading.value),
  );
  const providerList = computed<ProviderListItem[]>(() =>
    providers.value.filter((provider) => provider.isActive),
  );
  const selectedNativeModel = computed(() => {
    const choice = chatSession.runtimeChoice.value;
    return choice.runtimeKind === 'local_agent'
      ? localChoices.models.value.find((model) => model.id === choice.modelId)
      : undefined;
  });
  const currentNativeModelOptions = computed<LocalAgentModelOptions | undefined>(() => {
    const choice = chatSession.runtimeChoice.value;
    const model = selectedNativeModel.value;
    if (choice.runtimeKind !== 'local_agent' || !model) return undefined;
    const saved = nativeModelSelections.value[`${choice.connectionId}::${model.id}`];
    if (!saved) return undefined;
    const selected: LocalAgentModelOptions = {};
    if (saved.reasoningEffort && model.reasoningEfforts?.includes(saved.reasoningEffort))
      selected.reasoningEffort = saved.reasoningEffort;
    if (
      saved.serviceTier &&
      (saved.serviceTier === 'default' ||
        model.serviceTiers?.some((tier) => tier.id === saved.serviceTier))
    )
      selected.serviceTier = saved.serviceTier;
    return Object.keys(selected).length ? selected : undefined;
  });
  function selectNativeModelOption(kind: keyof LocalAgentModelOptions, value?: string) {
    if (chatSession.chatLoading.value) return;
    const choice = chatSession.runtimeChoice.value;
    const model = selectedNativeModel.value;
    if (choice.runtimeKind !== 'local_agent' || !model) return;
    // AGY's thinking levels are native model IDs, not a modelOptions field.
    // Switch to a verified exact slug rather than sending unsupported RPC params.
    if (kind === 'reasoningEffort' && value) {
      const variant = antigravityEffortVariant(model.id);
      const target =
        variant &&
        Object.values(catalog.entries.value)
          .flatMap((entry) => entry.models)
          .find(
            (item) =>
              item.providerId === choice.connectionId &&
              item.modelId === variant.family + '-' + value,
          );
      const instance = agentRegistrySnapshot.value?.instances.find(
        (item) => item.legacyConnectionId === choice.connectionId && item.driver === 'antigravity',
      );
      if (target && instance && ['high', 'medium', 'low'].includes(value)) {
        void selectComposerModel(target.key, target.agentKey);
        return;
      }
    }
    const allowed =
      kind === 'reasoningEffort'
        ? value === undefined || Boolean(model.reasoningEfforts?.includes(value))
        : value === undefined ||
          value === 'default' ||
          Boolean(model.serviceTiers?.some((tier) => tier.id === value));
    if (!allowed) return;
    const identity = `${choice.connectionId}::${model.id}`;
    const next = { ...nativeModelSelections.value[identity] };
    if (value) next[kind] = value;
    else delete next[kind];
    nativeModelSelections.value = {
      ...nativeModelSelections.value,
      [identity]: next,
    };
  }

  const modelSelection = useAIModelSelection({
    providers: providerList,
    agentRegistrySnapshot,
    modelCatalog,
    resolveIdentity,
    getDefaultModelKey: () => {
      const choice = localChoices.defaultChoice.value;
      if (choice.runtimeKind !== 'local_agent') return undefined;
      return Object.values(modelCatalog.value)
        .flatMap((entry) => entry.models)
        .find(
          (model) => model.providerId === choice.connectionId && model.modelId === choice.modelId,
        )?.key;
    },
    chatConversationId: chatSession.chatConversationId,
    ...(agentRegistryClient?.conversationSelection
      ? {
          readConversationSelection: (id: string) => agentRegistryClient.conversationSelection!(id),
        }
      : {}),
  });

  const composerAgents = computed(() => {
    const entries = sortAgentInstances(
      agentRegistrySnapshot.value?.instances.filter((instance) => instance.enabled) ?? [],
    );
    return entries.map((instance) => ({
      id:
        instance.driver === 'mastra'
          ? `agent:${instance.instanceId}`
          : `local:${instance.legacyConnectionId ?? instance.instanceId}`,
      name: instance.name,
      driver: instance.driver,
      enabled: instance.enabled,
      accentColor: instance.accentColor,
      supportedRuntimeModes: AGENT_SUPPORTED_RUNTIME_MODES[instance.driver],
      switchBlockedReason: composerSwitchBlockedReason(
        instance.driver === 'mastra'
          ? `agent:${instance.instanceId}`
          : `local:${instance.legacyConnectionId ?? instance.instanceId}`,
      ),
      configured:
        instance.driver === 'mastra'
          ? Boolean(
              agentRegistrySnapshot.value?.bindings.some(
                (binding) => binding.instanceId === instance.instanceId,
              ),
            )
          : Boolean(instance.legacyConnectionId),
    }));
  });
  const selectedComposerAgent = computed(() => {
    const choice = chatSession.runtimeChoice.value;
    if (choice.runtimeKind === 'local_agent') return `local:${choice.connectionId}`;
    const id =
      modelSelection.selectedAgentId.value ||
      modelSelection.selectedModel.value?.agentInstanceId ||
      agentRegistrySnapshot.value?.instances.find(
        (entry) => entry.driver === 'mastra' && entry.enabled,
      )?.instanceId;
    return id ? `agent:${id}` : '';
  });
  const composerCatalog = catalog.entries;
  const composerModels = computed(() => {
    const choice = chatSession.runtimeChoice.value;
    return presentAntigravityModels(
      Object.values(composerCatalog.value)
        .flatMap((entry) => entry.models)
        .map((model) => ({
          ...model,
          providerName:
            providerList.value.find((provider) => provider.id === model.providerId)?.name ??
            model.providerName,
        })),
      composerAgents.value,
      choice.runtimeKind === 'local_agent' ? choice.modelId : '',
      selectedComposerAgent.value,
    );
  });
  const composerModelKey = computed(() =>
    chatSession.runtimeChoice.value.runtimeKind === 'local_agent'
      ? chatSession.runtimeChoice.value.modelId
      : modelSelection.selectedModelKey.value,
  );
  async function refreshConfiguration() {
    await Promise.allSettled([loadProviders(), loadAgentRegistry(), localChoices.refresh()]);
  }
  watch(
    resolveIdentity,
    () => {
      ++explicitRuntimeSelection;
      nativeSelectionPending.value = false;
      nativeModelSelections.value = {};
      void refreshConfiguration();
    },
    { flush: 'sync' },
  );
  watch(
    [() => modelSelection.selectedModel.value?.key, () => modelCatalog.value, resolveIdentity],
    () => {
      const selectionEpoch = newThreadSelectionEpoch;
      const identity = resolveIdentity();
      const selected = modelSelection.selectedModel.value;
      if (
        disposed ||
        chatSession.chatConversationId.value ||
        chatSession.chatTimeline.value.length ||
        explicitRuntimeSelection ||
        !selected?.agentInstanceId
      )
        return;
      const instance = agentRegistrySnapshot.value?.instances.find(
        (entry) => entry.instanceId === selected.agentInstanceId,
      );
      if (
        !instance ||
        instance.driver === 'mastra' ||
        !instance.enabled ||
        !instance.legacyConnectionId ||
        chatSession.runtimeChoice.value.runtimeKind !== 'builtin'
      )
        return;
      if (
        selectionEpoch !== newThreadSelectionEpoch ||
        identity !== resolveIdentity() ||
        chatSession.chatConversationId.value ||
        chatSession.chatTimeline.value.length ||
        explicitRuntimeSelection
      )
        return;
      chatSession.runtimeChoice.value = {
        runtimeKind: 'local_agent',
        connectionId: instance.legacyConnectionId,
        modelId: selected.modelId,
      };
    },
    { flush: 'sync' },
  );
  if (configurationRevision) {
    watch(configurationRevision, () => {
      void Promise.allSettled([loadAgentRegistry(), localChoices.refresh()]);
    });
  }
  watch(
    () => route.path,
    (path, previous) => {
      if (previous?.startsWith('/settings') && !path.startsWith('/settings'))
        void refreshConfiguration();
    },
  );
  onActivated(() => {
    void refreshConfiguration();
  });
  const supportedRuntimeModes = computed(() => {
    const choice = chatSession.runtimeChoice.value;
    const instance = agentRegistrySnapshot.value?.instances.find((entry) =>
      choice.runtimeKind === 'local_agent'
        ? entry.legacyConnectionId === choice.connectionId
        : `agent:${entry.instanceId}` === selectedComposerAgent.value,
    );
    return instance
      ? AGENT_SUPPORTED_RUNTIME_MODES[instance.driver]
      : AGENT_SUPPORTED_RUNTIME_MODES.mastra;
  });
  const permissionStorageKey = () => {
    const owner = resolveIdentity();
    const id = chatSession.chatConversationId.value;
    return owner && id
      ? `ai:composer:runtime-mode:v1:${encodeURIComponent(owner)}:${encodeURIComponent(id)}`
      : '';
  };
  watch(
    [resolveIdentity, chatSession.chatConversationId],
    ([owner, id], previous) => {
      let saved: unknown;
      try {
        const key = permissionStorageKey();
        saved = key ? JSON.parse(localStorage.getItem(key) ?? 'null') : null;
      } catch {
        /* Storage restrictions do not prevent a supervised session. */
      }
      const parsed = AIChatPermissionModeSchema.safeParse(saved);
      // Creating the first thread preserves its draft choice; opening another thread restores its own choice.
      const mode = parsed.success
        ? parsed.data
        : previous && previous[0] === owner && !previous[1] && id
          ? permissionMode.value
          : 'approval-required';
      permissionMode.value = resolveCompatibleRuntimeMode(mode, supportedRuntimeModes.value);
      savePermission();
    },
    { flush: 'sync', immediate: true },
  );
  function savePermission() {
    try {
      const key = permissionStorageKey();
      if (key) localStorage.setItem(key, JSON.stringify(permissionMode.value));
    } catch {
      /* In-memory selection still applies to subsequent turns. */
    }
  }
  watch(permissionMode, savePermission, { flush: 'sync' });
  watch(supportedRuntimeModes, (supported) => {
    permissionMode.value = resolveCompatibleRuntimeMode(permissionMode.value, supported);
  });
  function composerSwitchBlockedReason(
    key: string,
  ): 'incompatible' | 'busy' | 'loading' | undefined {
    if (chatSession.chatLoading.value || isWorkflowSelectionLocked()) return 'busy';
    if (modelSelection.selectionLoading.value || nativeSelectionPending.value) return 'loading';
    if (!chatSession.chatConversationId.value) return undefined;
    const choice = chatSession.runtimeChoice.value;
    if (choice.runtimeKind === 'local_agent')
      return key === `local:${choice.connectionId}` ? undefined : 'incompatible';
    return key.startsWith('agent:') ? undefined : 'incompatible';
  }
  async function selectComposerModel(key: string, agentKey: string) {
    if (composerSwitchBlockedReason(agentKey)) return;
    const instance = agentRegistrySnapshot.value?.instances.find(
      (entry) => entry.enabled && composerAgentKey(entry) === agentKey,
    );
    const entry = instance && composerCatalog.value[instance.instanceId];
    const model =
      entry?.status === 'ready' ? entry.models.find((item) => item.key === key) : undefined;
    if (!instance || !model) return;
    const request = ++explicitRuntimeSelection;
    ++newThreadSelectionEpoch;
    const identity = resolveIdentity();
    const conversationId = chatSession.chatConversationId.value;
    if (instance.driver !== 'mastra') {
      if (!localAgent || !agentRegistryClient) return;
      nativeSelectionPending.value = true;
      try {
        let id = instance.legacyConnectionId;
        if (!id) {
          if (instance.instanceId !== instance.driver)
            throw new Error('Native instance has no connection');
          const beforeMaterialization = (await agentRegistryClient.list()).instances.find(
            (item) => item.instanceId === instance.instanceId,
          );
          if (
            !beforeMaterialization ||
            !beforeMaterialization.enabled ||
            beforeMaterialization.driver !== instance.driver ||
            beforeMaterialization.revision !== instance.revision ||
            beforeMaterialization.legacyConnectionId
          )
            throw new Error('Native Agent changed before connection materialization');
          try {
            const updated = await agentRegistryClient.execute({
              action: 'update',
              instanceId: instance.instanceId,
              expectedRevision: instance.revision,
              patch: {},
            });
            if (
              !updated ||
              !('instanceId' in updated) ||
              updated.instanceId !== instance.instanceId ||
              !('legacyConnectionId' in updated)
            )
              throw new Error('Native Agent connection could not be resolved');
            id = updated.legacyConnectionId;
          } catch (error) {
            // Resolve a concurrent idempotent materialization from fresh authority.
            const latest = (await agentRegistryClient.list()).instances.find(
              (item) => item.instanceId === instance.instanceId,
            );
            if (!latest?.enabled || !latest.legacyConnectionId) throw error;
            id = latest.legacyConnectionId;
          }
        }
        if (disposed || identity !== resolveIdentity() || request !== explicitRuntimeSelection)
          return;
        const [connections, latest] = await Promise.all([
          localAgent.listConnections(),
          agentRegistryClient.list(),
        ]);
        if (
          disposed ||
          identity !== resolveIdentity() ||
          request !== explicitRuntimeSelection ||
          conversationId !== chatSession.chatConversationId.value
        )
          return;
        const active = latest.instances.find(
          (item) =>
            item.instanceId === instance.instanceId &&
            item.enabled &&
            item.legacyConnectionId === id &&
            item.driver === instance.driver,
        );
        if (
          !id ||
          !active ||
          !connections.some(
            (item) => item.id === id && item.enabled && item.driver === instance.driver,
          )
        )
          throw new Error('Native Agent connection is no longer available');
        // Explicit selection needs an identity-bound membership check, but not
        // another slow native spawn when Desktop has recently verified this exact
        // saved account/configuration. Sending still performs fresh native checks.
        const [verified, beforeCommitSnapshot] = await Promise.all([
          localAgent.cachedCatalogConnection?.(id) ?? null,
          agentRegistryClient.list(),
        ]);
        if (
          disposed ||
          identity !== resolveIdentity() ||
          request !== explicitRuntimeSelection ||
          conversationId !== chatSession.chatConversationId.value
        )
          return;
        const discovered = verified ?? (await localAgent.probeConnection(id));
        if (
          disposed ||
          identity !== resolveIdentity() ||
          request !== explicitRuntimeSelection ||
          conversationId !== chatSession.chatConversationId.value
        )
          return;
        if (
          discovered.status !== 'ready' ||
          !discovered.models.some((item) => item.id === model.modelId)
        )
          throw new Error('Native model is no longer available; check the instance again');
        const beforeCommit = beforeCommitSnapshot.instances.find(
          (item) => item.instanceId === instance.instanceId,
        );
        if (
          !beforeCommit ||
          !beforeCommit.enabled ||
          beforeCommit.driver !== instance.driver ||
          beforeCommit.legacyConnectionId !== id
        )
          throw new Error('Native Agent changed before model selection was committed');
        // Do not commit a partial empty-model selection. All failures preserve draft and prior route.
        if (chatSession.chatLoading.value || isWorkflowSelectionLocked()) return;
        const choice = chatSession.runtimeChoice.value;
        if (conversationId && (choice.runtimeKind !== 'local_agent' || choice.connectionId !== id))
          return;
        chatSession.runtimeChoice.value = {
          runtimeKind: 'local_agent',
          connectionId: id,
          modelId: model.modelId,
        };

        if (!instance.legacyConnectionId) void loadAgentRegistry();
        await localChoices.refresh();
      } catch (error) {
        if (!disposed && identity === resolveIdentity() && request === explicitRuntimeSelection)
          toast.error(getAIErrorMessage(error, t, 'aiAssistant.local.actionFailed'));
      } finally {
        if (request === explicitRuntimeSelection) nativeSelectionPending.value = false;
      }
    } else {
      if (modelSelection.selectModel(key) !== 'selected') return;
      chatSession.runtimeChoice.value = { runtimeKind: 'builtin' };
    }
  }
  function selectPermission(mode: AIChatPermissionMode) {
    if (chatSession.chatLoading.value) return;
    permissionMode.value = resolveCompatibleRuntimeMode(mode, supportedRuntimeModes.value);
  }

  return {
    permissionMode,
    composerInitializing,
    composerLoading,
    modelCatalogLoading,
    loadAgentRegistry,
    currentNativeModelOptions,
    selectNativeModelOption,
    modelSelection,
    composerAgents,
    selectedComposerAgent,
    composerCatalog,
    composerModels,
    composerModelKey,
    composerSwitchBlockedReason,
    selectComposerModel,
    selectPermission,
    bumpExplicitRuntimeSelection: () => ++explicitRuntimeSelection,
    readExplicitRuntimeSelection: () => explicitRuntimeSelection,
    bumpNewThreadSelectionEpoch: () => ++newThreadSelectionEpoch,
    readNewThreadSelectionEpoch: () => newThreadSelectionEpoch,
    markDisposed: () => {
      disposed = true;
    },
    isDisposed: () => disposed,
  };
}
