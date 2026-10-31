import { useAIWorkflowReconciliation } from './useAIWorkflowReconciliation';
import { aiUiHost } from '../ai-ui-host';
import {
  computed,
  inject,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import {
  KnowledgeDocumentIdSchema,
  type KnowledgeDocumentRef,
} from '@memoflow/repository-contracts';
import type {
  AIWorkflowRunView,
  AIChatPermissionMode,
  LocalAgentModelOptions,
} from '@memoflow/ai-contracts';
import { useAI } from './useAI';
import { useAIModelCatalog, composerAgentKey } from './useAIModelCatalog';
import { sortAgentInstances } from '../agent-instance-order';
import { antigravityEffortVariant, presentAntigravityModels } from './antigravityModelPresentation';
import { useLocalAssistantChoices } from './useLocalAssistantChoices';
import { getAIErrorMessage, getNativeAgentExecutionFailureMessage } from './error';
import { useAIChatSession } from './useAIChatSession';
import { useAIModelSelection } from './useAIModelSelection';
import { useAIGoalWorkflow } from './useAIGoalWorkflow';
import { useAITaskWorkflow } from './useAITaskWorkflow';
import { useAIKnowledgeCapture } from './useAIKnowledgeCapture';
import { useAIKnowledgeQaWorkflow } from './useAIKnowledgeQaWorkflow';
import { useAIWorkflowPersistence } from './useAIWorkflowPersistence';
import { useAIFormatters } from './useAIFormatters';
import { getToolLocaleKey, normalizeWorkflowMode } from './types';
import { surfaceDescriptorToContextEntity, type AIActiveSurfaceDescriptor } from './surfaceContext';
import {
  canLeaveAIWorkflowReview,
  adjustComposerHeight as createAdjustComposerHeight,
  bindChatViewLifecycle,
  initializeChatView,
  AIWorkflowRestoreError,
  loadAuthoritativeWorkflowRun,
  maybeRenameConversation,
} from './chatViewHelpers';
import {
  AI_ASSISTANT_RUNTIME_KEY,
  AI_AGENT_REGISTRY_KEY,
  AI_CONFIGURATION_REVISION_KEY,
  AI_LOCAL_AGENT_KEY,
  REPOSITORY_SERVICE_KEY,
  AI_RUNTIME_USAGE_KEY,
  AI_WORKFLOW_RUNTIME_KEY,
  ASSISTANT_SURFACE_KEY,
} from '../ai-ui-host';
import { unwrapOrThrowError } from '@memoflow/transport-contracts/result';
import type {
  AIWorkspaceRecentGoal,
  AIWorkspaceRecentKnowledgeNote,
  AIWorkspaceRecentTask,
  ConversationSummary,
  ProviderListItem,
  WorkflowMode,
} from './types';

export interface UseAIChatViewOptions {
  getComposerTextarea: () => HTMLTextAreaElement | null;
  /** Visible business tab beside chat; used as removable implicit Goal/Task context. */
  getActiveSurface?: () => AIActiveSurfaceDescriptor | null;
}

/**
 * Thin AI workspace projection over the canonical Mastra Assistant/Workflow clients.
 * The UI owns presentation state only; runtime lifecycle stays server-owned.
 */
export function useAIChatView(options: UseAIChatViewOptions) {
  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const { service, providers, loadProviders, refreshProviderModels } = useAI();
  const assistantRuntime = aiUiHost.useStrictInject(AI_ASSISTANT_RUNTIME_KEY, 'AIAssistantRuntime');
  const runtimeUsage = aiUiHost.useStrictInject(AI_RUNTIME_USAGE_KEY, 'AIRuntimeUsage');
  const workflowRuntime = aiUiHost.useStrictInject(AI_WORKFLOW_RUNTIME_KEY, 'AIWorkflowRuntime');
  const assistantSurface = aiUiHost.useStrictInject(ASSISTANT_SURFACE_KEY, 'AIRuntimeSurface');
  const localAgent = inject(AI_LOCAL_AGENT_KEY, undefined);
  const agentRegistryClient = inject(AI_AGENT_REGISTRY_KEY, undefined);
  const resolveIdentity = aiUiHost.useServerStateIdentityScope();
  const catalog = useAIModelCatalog({
    resolveIdentity,
    registry: agentRegistryClient,
    native: localAgent,
    refreshProviderModels,
  });
  const agentRegistrySnapshot = catalog.snapshot;
  const modelCatalog = catalog.entries;
  const modelCatalogLoading = catalog.loading;
  const loadAgentRegistry = catalog.refresh;
  const configurationRevision = inject(AI_CONFIGURATION_REVISION_KEY, undefined);
  const permissionMode = ref<AIChatPermissionMode>('supervised');
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
  const repository = inject(REPOSITORY_SERVICE_KEY, undefined);
  const knowledgeNativeSurface = aiUiHost.useKnowledgeNativeSurfaceRegistration();
  async function saveLocalNote(content: string) {
    if (!localAgent || !repository || !knowledgeNativeSurface) return;
    try {
      const binding = unwrapOrThrowError(await repository.getLocalVaultBinding());
      if (!binding || binding.health.state !== 'Available')
        throw new Error('Select an available local Vault first');
      await aiUiHost.openLocalAgentNoteReview({
        content,
        surface: knowledgeNativeSurface,
        bindingId: binding.binding.id,
        currentBindingId: async () =>
          unwrapOrThrowError(await repository.getLocalVaultBinding())?.binding.id ?? null,
        persist: async (request) =>
          unwrapOrThrowError(await repository.writeConfirmedLocalVaultNote(request)),
        onSaved: requestOpenKnowledgeNote,
        onError: () => toast.error(t('aiAssistant.local.noteSaveFailed')),
      });
    } catch {
      toast.error(t('aiAssistant.local.noteSaveFailed'));
    }
  }
  const { goals, fetchGoals } = aiUiHost.useGoal();
  const task = aiUiHost.useTask();
  const recentKnowledgeNotes = aiUiHost.useRecentKnowledgeNotes();
  const referenceableKnowledgeNotes = aiUiHost.useReferenceableKnowledgeNotes();
  const formatters = useAIFormatters();

  async function requestOpenKnowledgeNote(note: string | KnowledgeDocumentRef): Promise<void> {
    const noteId = typeof note === 'string' ? note : note.documentId;
    if (!noteId) return;
    await router.push({ path: '/repository', query: { note: noteId } });
  }

  async function loadRecentKnowledgeNotes(): Promise<void> {
    await recentKnowledgeNotes.load(20);
  }

  function getDefaultConversationName(mode: WorkflowMode | string): string {
    const normalizedMode = normalizeWorkflowMode(mode);
    if (normalizedMode === 'goal-create')
      return t('aiAssistant.chatPage.workflow.defaultConversationNames.goalCreate');
    if (normalizedMode === 'task-create')
      return t('aiAssistant.chatPage.workflow.defaultConversationNames.taskCreate');
    if (normalizedMode === 'knowledge-capture')
      return t('aiAssistant.chatPage.workflow.defaultConversationNames.knowledgeCapture');
    if (normalizedMode === 'knowledge-qa')
      return t('aiAssistant.chatPage.workflow.defaultConversationNames.knowledgeQa');
    return t('aiAssistant.dialogs.chat.defaultConversationName');
  }

  const toolMode = ref<WorkflowMode>('chat');
  const adjustComposerHeight = () => createAdjustComposerHeight(options.getComposerTextarea);

  const recentGoalList = computed<AIWorkspaceRecentGoal[]>(() =>
    [...goals.value]
      .filter((goal) => !goal.deletedAt)
      .sort((left, right) => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0))
      .slice(0, 5)
      .map((goal) => ({
        id: String(goal.id),
        title: goal.name,
        status: String(goal.status),
        updatedAt: Number(goal.updatedAt ?? 0),
        progress: goal.overallProgress,
      })),
  );

  const referenceGoalList = computed<AIWorkspaceRecentGoal[]>(() =>
    [...goals.value]
      .filter((goal) => !goal.deletedAt)
      .sort((left, right) => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0))
      .slice(0, 50)
      .map((goal) => ({
        id: String(goal.id),
        title: goal.name,
        status: String(goal.status),
        updatedAt: Number(goal.updatedAt ?? 0),
        progress: goal.overallProgress,
      })),
  );

  const recentTaskList = computed<AIWorkspaceRecentTask[]>(() =>
    [...(task.templates.value ?? [])]
      .sort((left, right) => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0))
      .slice(0, 8)
      .map((item) => ({
        id: String(item.id),
        title: item.name,
        updatedAt: Number(item.updatedAt ?? 0),
      })),
  );

  const referenceTaskList = computed<AIWorkspaceRecentTask[]>(() =>
    [...(task.templates.value ?? [])]
      .sort((left, right) => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0))
      .slice(0, 50)
      .map((item) => ({
        id: String(item.id),
        title: item.name,
        updatedAt: Number(item.updatedAt ?? 0),
      })),
  );

  const recentKnowledgeNoteList = computed<AIWorkspaceRecentKnowledgeNote[]>(() =>
    [...recentKnowledgeNotes.notes.value]
      .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt))
      .slice(0, 5)
      .map((note) => ({
        id: note.id,
        contextId: note.knowledgeDocumentId,
        title: note.title,
        path: note.path,
        updatedAt: note.updatedAt,
      })),
  );

  const providerList = computed<ProviderListItem[]>(() =>
    providers.value.filter((provider) => provider.isActive),
  );
  const persistWorkflowAndModel = (id: string) => {
    persistence.persistWorkflowState(id);
    modelSelection.persistSelectedModel(modelSelection.selectedModelKey.value, id);
  };

  const chatSession = useAIChatSession({
    service,
    runtime: assistantRuntime,
    workspaceRuntime: workflowRuntime,
    localAgent,
    onNativeRunSettled: (connectionId) => {
      const selected = chatSession.runtimeChoice.value;
      if (selected.runtimeKind === 'local_agent' && selected.connectionId === connectionId) {
        // Re-reading the cached AGY status after each turn must not unpack and
        // spawn another ~1GB PyInstaller process. Other drivers keep the
        // existing native validation behavior.
        const connection = localChoices.connections.value.find(
          (entry) => entry.id === connectionId,
        );
        void localChoices.probe(connectionId, {
          fresh: connection?.driver !== 'antigravity',
        });
      }
    },
    getPermissionMode: () => permissionMode.value,
    getNativeModelOptions: () => currentNativeModelOptions.value,
    getDefaultRuntimeChoice: () => localChoices.defaultChoice.value,
    usageRuntime: runtimeUsage,
    surface: assistantSurface,
    getDefaultConversationName,
    onConversationCreated: persistWorkflowAndModel,
  });

  const localChoices = useLocalAssistantChoices(
    localAgent,
    chatSession.runtimeChoice,
    aiUiHost.useServerStateIdentityScope(),
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
  watch(
    () => chatSession.runtimeChoice.value.runtimeKind,
    () => {
      permissionMode.value = 'supervised';
    },
  );
  watch(chatSession.chatConversationId, (next, previous) => {
    if (previous && next !== previous) permissionMode.value = 'supervised';
  });
  function composerSwitchBlockedReason(
    key: string,
  ): 'incompatible' | 'busy' | 'loading' | undefined {
    if (chatSession.chatLoading.value || workflowSelectionLocked.value) return 'busy';
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
    const previousAgent = selectedComposerAgent.value;
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
        // another slow ACP spawn if Desktop has recently verified this exact
        // saved AGY account/configuration. Sending still performs fresh native checks.
        const [verified, beforeCommitSnapshot] = await Promise.all([
          instance.driver === 'antigravity'
            ? localAgent.cachedCatalogConnection(id)
            : Promise.resolve(null),
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
        if (chatSession.chatLoading.value || workflowSelectionLocked.value) return;
        const choice = chatSession.runtimeChoice.value;
        if (conversationId && (choice.runtimeKind !== 'local_agent' || choice.connectionId !== id))
          return;
        chatSession.runtimeChoice.value = {
          runtimeKind: 'local_agent',
          connectionId: id,
          modelId: model.modelId,
        };
        if (previousAgent !== agentKey) permissionMode.value = 'supervised';
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
      if (previousAgent !== agentKey) permissionMode.value = 'supervised';
    }
  }
  function selectPermission(mode: AIChatPermissionMode) {
    if (chatSession.chatLoading.value) return;
    const native = chatSession.runtimeChoice.value.runtimeKind === 'local_agent';
    if (mode === 'supervised' || (native ? mode === 'auto-approve' : mode === 'read-only'))
      permissionMode.value = mode;
  }

  async function maybeRenameCurrentConversation(name: string) {
    const nextName = name.trim();
    const currentTitle = chatSession.conversationTitle.value;
    if (!nextName || nextName === currentTitle) return;
    const conversationId = chatSession.chatConversationId.value;
    const before = chatSession.conversationList.value.find((item) => item.id === conversationId);
    const versionBefore =
      before?.runtimeKind === 'local_agent' ? undefined : before?.resourceVersion;
    chatSession.conversationTitle.value = nextName;
    const renamed = await maybeRenameConversation(
      nextName,
      currentTitle,
      conversationId,
      service,
      async (conversation) => {
        chatSession.syncConversationSummary(conversation);
      },
    );
    if (
      !renamed &&
      chatSession.chatConversationId.value === conversationId &&
      chatSession.conversationTitle.value === nextName &&
      !chatSession.conversationList.value.some(
        (item) =>
          item.id === conversationId &&
          item.runtimeKind !== 'local_agent' &&
          (item.resourceVersion ?? 0) > (versionBefore ?? 0),
      )
    )
      chatSession.conversationTitle.value = currentTitle;
  }

  const goalWorkflow = useAIGoalWorkflow({
    workflowRuntime,
    selectedModel: modelSelection.selectedModel,
    chatConversationId: chatSession.chatConversationId,
    chatLoading: chatSession.chatLoading,
    chatTimeline: chatSession.chatTimeline,
    conversationTitle: chatSession.conversationTitle,
    hasWorkflowUserMessages: chatSession.hasWorkflowUserMessages,
    buildConversationTranscript: chatSession.buildConversationTranscript,
    scrollMessagesToBottom: chatSession.scrollMessagesToBottom,
    maybeRenameCurrentConversation,
  });

  const knowledgeQaWorkflow = useAIKnowledgeQaWorkflow({
    service,
    selectedModel: modelSelection.selectedModel,
    chatConversationId: chatSession.chatConversationId,
    chatLoading: chatSession.chatLoading,
    chatTimeline: chatSession.chatTimeline,
    hasWorkflowUserMessages: chatSession.hasWorkflowUserMessages,
    scrollMessagesToBottom: chatSession.scrollMessagesToBottom,
    requestOpenKnowledgeNote,
  });

  const taskWorkflow = useAITaskWorkflow({
    workflowRuntime,
    selectedModel: modelSelection.selectedModel,
    chatConversationId: chatSession.chatConversationId,
    chatLoading: chatSession.chatLoading,
    chatTimeline: chatSession.chatTimeline,
    hasWorkflowUserMessages: chatSession.hasWorkflowUserMessages,
    buildConversationTranscript: chatSession.buildConversationTranscript,
    scrollMessagesToBottom: chatSession.scrollMessagesToBottom,
    maybeRenameCurrentConversation,
    openCreatedTask,
  });

  const knowledgeCaptureWorkflow = useAIKnowledgeCapture({
    workflowRuntime,
    selectedModel: modelSelection.selectedModel,
    chatConversationId: chatSession.chatConversationId,
    chatLoading: chatSession.chatLoading,
    chatTimeline: chatSession.chatTimeline,
    hasWorkflowUserMessages: chatSession.hasWorkflowUserMessages,
    buildConversationTranscript: chatSession.buildConversationTranscript,
    scrollMessagesToBottom: chatSession.scrollMessagesToBottom,
    maybeRenameCurrentConversation,
    openCreatedNote: requestOpenKnowledgeNote,
  });

  function resetWorkflowArtifacts() {
    goalWorkflow.resetGoalArtifacts();
    knowledgeQaWorkflow.resetKnowledgeAnswer();
    taskWorkflow.resetTaskWorkflowLocalState();
    knowledgeCaptureWorkflow.resetKnowledgeCaptureLocalState();
  }

  const persistence = useAIWorkflowPersistence({
    toolMode,
    goalWorkflowStage: goalWorkflow.goalWorkflowStage,
    goalWorkflowRun: goalWorkflow.goalWorkflowRun,
    taskWorkflowRun: taskWorkflow.taskWorkflowRun,
    knowledgeCaptureRun: knowledgeCaptureWorkflow.knowledgeCaptureRun,
    clarificationAnswers: goalWorkflow.clarificationAnswers,
    editableTasks: goalWorkflow.editableTasks,
    editableKnowledge: goalWorkflow.editableKnowledge,
    resetWorkflowArtifacts,
  });

  async function restoreWorkflowState(conversationId: string) {
    if (chatSession.runtimeChoice.value.runtimeKind === 'local_agent') return;
    const persisted = persistence.restoreWorkflowState(conversationId);
    if (!persisted) return;

    try {
      const run = await loadAuthoritativeWorkflowRun(
        workflowRuntime,
        conversationId,
        persisted.activeRunId,
      );
      switch (run.kind) {
        case 'goal.create':
          toolMode.value = 'goal-create';
          await goalWorkflow.projectRun(run, false);
          break;
        case 'task.create':
          toolMode.value = 'task-create';
          await taskWorkflow.projectRun(run, false);
          break;
        case 'knowledge.capture':
          toolMode.value = 'knowledge-capture';
          await knowledgeCaptureWorkflow.projectRun(run, false);
          break;
      }
      if (run.status === 'failed' || run.status === 'cancelled') {
        persistence.clearWorkflowState(conversationId);
        toolMode.value = 'chat';
        return;
      }
      persistence.applyEditorOverlay(persisted.editorOverlay, run);
      // Rebase or discard any stale overlay against the runtime revision.
      persistence.persistWorkflowState(conversationId);
      // History restoration updates only AI projections; native business review is explicit.
    } catch (error) {
      // Runtime failure is an explicit empty/blocked restore. The reset above
      // ensures no stale local run or draft remains visible as authority.
      if (
        error instanceof AIWorkflowRestoreError &&
        error.code !== 'AI_WORKFLOW_RUNTIME_UNAVAILABLE'
      ) {
        persistence.clearWorkflowState(conversationId);
      }
      toast.error(t('aiAssistant.errors.workflowExecutionFailed'));
    }
  }

  const referenceKnowledgeNoteList = computed<AIWorkspaceRecentKnowledgeNote[]>(() =>
    referenceableKnowledgeNotes.notes.value.slice(0, 20).map((note) => ({
      id: note.documentId,
      contextId: note.documentId,
      title: note.title,
      path: note.path,
      updatedAt: note.updatedAt,
    })),
  );

  async function loadWorkspaceLists() {
    await Promise.all([
      chatSession.loadConversationList(service),
      fetchGoals().catch(() => undefined),
      task.fetchTemplates({ page: 1, limit: 50 }).catch(() => undefined),
      loadRecentKnowledgeNotes().catch(() => undefined),
      referenceableKnowledgeNotes.load({ limit: 20 }).catch(() => undefined),
    ]);
  }

  function syncSurfaceContext() {
    const shellEntity = surfaceDescriptorToContextEntity(options.getActiveSurface?.());
    if (shellEntity) {
      chatSession.setSurfaceContextEntity(shellEntity);
      return;
    }

    const id = typeof route.params.id === 'string' ? route.params.id : '';
    if (route.name === 'goal-detail' && id) {
      const goal = goals.value.find((item) => String(item.id) === id);
      chatSession.setSurfaceContextEntity({
        entityType: 'goal',
        id,
        label: goal?.name || t('aiAssistant.chatPage.context.currentGoal'),
      });
      return;
    }
    if (route.name === 'task-detail' && id) {
      const item = task.templates.value?.find((template) => String(template.id) === id);
      chatSession.setSurfaceContextEntity({
        entityType: 'task',
        id,
        label: item?.name || t('aiAssistant.chatPage.context.currentTask'),
      });
      return;
    }
    if (route.name === 'repository') {
      const rawNote = route.query.note;
      const noteRef =
        typeof rawNote === 'string'
          ? rawNote
          : Array.isArray(rawNote) && typeof rawNote[0] === 'string'
            ? rawNote[0]
            : '';
      if (noteRef) {
        const note = recentKnowledgeNotes.notes.value.find(
          (item) =>
            item.id === noteRef || item.path === noteRef || item.knowledgeDocumentId === noteRef,
        );
        const knowledgeDocumentId =
          note?.knowledgeDocumentId ??
          (KnowledgeDocumentIdSchema.safeParse(noteRef).success ? noteRef : null);
        if (knowledgeDocumentId) {
          chatSession.setSurfaceContextEntity({
            entityType: 'knowledge_document',
            id: knowledgeDocumentId,
            label: note?.title || t('aiAssistant.chatPage.context.currentNote'),
          });
          return;
        }
      }
    }
    chatSession.setSurfaceContextEntity(null);
  }

  watch(
    [
      () => route.name,
      () => route.params.id,
      () => route.query.note,
      goals,
      task.templates,
      recentKnowledgeNotes.notes,
      () => options.getActiveSurface?.()?.module ?? '',
      () => options.getActiveSurface?.()?.route ?? '',
      () => options.getActiveSurface?.()?.title ?? '',
    ],
    () => syncSurfaceContext(),
    { immediate: true },
  );

  persistence.bindPersistenceWatcher(chatSession.chatConversationId);

  function activeWorkflowRun(): AIWorkflowRunView | null {
    if (toolMode.value === 'goal-create') return goalWorkflow.goalWorkflowRun.value;
    if (toolMode.value === 'task-create') return taskWorkflow.taskWorkflowRun.value;
    if (toolMode.value === 'knowledge-capture')
      return knowledgeCaptureWorkflow.knowledgeCaptureRun.value;
    return null;
  }

  async function projectAuthoritativeWorkflowRun(run: AIWorkflowRunView): Promise<void> {
    switch (run.kind) {
      case 'goal.create':
        await goalWorkflow.projectRun(run);
        if (run.suspension?.type === 'goal_draft_review') {
          await maybeRenameCurrentConversation(run.suspension.draft.goal.name);
        }
        return;
      case 'task.create':
        await taskWorkflow.projectRun(run);
        if (run.suspension?.type === 'task_draft_review') {
          await maybeRenameCurrentConversation(run.suspension.draft.task.title);
        }
        return;
      case 'knowledge.capture':
        await knowledgeCaptureWorkflow.projectRun(run);
        if (run.suspension?.type === 'knowledge_draft_review') {
          await maybeRenameCurrentConversation(run.suspension.draft.title);
        }
    }
  }

  useAIWorkflowReconciliation({
    current: activeWorkflowRun,
    get: (request) => workflowRuntime.get(request),
    project: projectAuthoritativeWorkflowRun,
    stopped: (run, reason) => {
      // Clear only the local projection. Transient failure retains the durable
      // pointer for an explicit restore; confirmed absence retires that pointer.
      if (reason === 'missing') {
        persistence.clearWorkflowState(run.conversationId);
        if (run.kind === 'goal.create') void goalWorkflow.projectRun(null);
        if (run.kind === 'task.create') void taskWorkflow.projectRun(null);
        if (run.kind === 'knowledge.capture') void knowledgeCaptureWorkflow.projectRun(null);
      }
      toast.error(
        t(
          reason === 'missing'
            ? 'aiAssistant.errors.workflowRunUnavailable'
            : 'aiAssistant.errors.workflowReadUnavailable',
        ),
      );
    },
  });

  const currentConversationLabel = computed(
    () => chatSession.conversationTitle.value || getDefaultConversationName(toolMode.value),
  );
  const currentToolLabel = computed(() =>
    toolMode.value === 'chat'
      ? t('aiAssistant.chatPage.workflow.tools.chat')
      : t(`aiAssistant.chatPage.workflow.tools.${getToolLocaleKey(toolMode.value)}`),
  );

  const workflowSelectionLocked = computed(
    () =>
      goalWorkflow.goalAgentResuming.value ||
      goalWorkflow.goalOwnerAttemptPending.value ||
      goalWorkflow.goalRestartPending.value ||
      goalWorkflow.goalSurfaceControlLost.value ||
      taskWorkflow.taskAgentResuming.value ||
      taskWorkflow.taskOwnerAttemptPending.value ||
      knowledgeCaptureWorkflow.knowledgeCaptureResuming.value ||
      [
        goalWorkflow.goalWorkflowRun.value,
        taskWorkflow.taskWorkflowRun.value,
        knowledgeCaptureWorkflow.knowledgeCaptureRun.value,
      ].some((run) => run && !['completed', 'failed', 'cancelled'].includes(run.status)),
  );
  const canSendMessage = computed(
    () =>
      !chatSession.chatLoading.value &&
      !goalWorkflow.goalAgentLoading.value &&
      !goalWorkflow.goalAgentResuming.value &&
      !goalWorkflow.goalManualHandoff.value &&
      (chatSession.runtimeChoice.value.runtimeKind === 'local_agent'
        ? localChoices.canSend.value
        : modelSelection.canSendMessage.value &&
          modelSelection.selectedModel.value !== null &&
          (!agentRegistryClient ||
            Boolean(
              Object.values(composerCatalog.value).some(
                (entry) =>
                  entry.status === 'ready' &&
                  entry.models.some((model) => model.key === modelSelection.selectedModelKey.value),
              ),
            ))),
  );
  function canLeaveWorkflowReview(): boolean {
    // The handed-off native draft still coordinates deterministic workflow Save.
    // Do not reset that coordinator while the user is editing it.
    if (goalWorkflow.goalManualHandoff.value) {
      toast.info(t('aiAssistant.businessSurface.handedOff'));
      return false;
    }
    return canLeaveAIWorkflowReview(
      toolMode.value,
      {
        goal:
          goalWorkflow.goalAgentResuming.value ||
          goalWorkflow.goalOwnerAttemptPending.value ||
          goalWorkflow.goalRestartPending.value ||
          goalWorkflow.goalSurfaceControlLost.value,
        task: taskWorkflow.taskAgentResuming.value || taskWorkflow.taskOwnerAttemptPending.value,
        knowledge: knowledgeCaptureWorkflow.knowledgeCaptureResuming.value,
      },
      // Chat/Q&A lifecycle does not leave the visible business surface.
      () =>
        toolMode.value === 'chat' ||
        toolMode.value === 'knowledge-qa' ||
        aiUiHost.canLeaveBusinessSurface(t),
      () => toast.info(t('shell.panel.busyTransitionHint')),
    );
  }

  async function selectConversation(item: ConversationSummary) {
    if (!canLeaveWorkflowReview()) return;
    persistence.suspendWorkflowPersistence.value = true;
    try {
      await chatSession.selectConversation(
        item,
        service,
        modelSelection.syncSelectedModel,
        modelSelection.getPersistedModelKey,
      );
      if (item.runtimeKind === 'local_agent') {
        resetWorkflowArtifacts();
        toolMode.value = 'chat';
      } else await restoreWorkflowState(item.id);
      syncSurfaceContext();
    } finally {
      persistence.suspendWorkflowPersistence.value = false;
    }
  }

  async function restoreArchivedConversation(id: string) {
    const activeBefore = chatSession.chatConversationId.value;
    const item = chatSession.conversationList.value.find((entry) => entry.id === id);
    if (!(await chatSession.restoreConversation(id)) || !item) return;
    // Recovery can target history outside the active discovery page. Open it
    // without requiring a new list rank, while retaining any current draft/run.
    if (
      chatSession.chatConversationId.value === activeBefore &&
      !chatSession.chatLoading.value &&
      !workflowSelectionLocked.value &&
      !['working', 'input', 'approval'].includes(
        chatSession.conversationStatuses.value[chatSession.chatConversationId.value] ?? '',
      ) &&
      !chatSession.chatMessage.value.length &&
      !chatSession.composerAttachments.value.length &&
      !chatSession.composerContextEntities.value.some((entry) => entry.origin === 'explicit')
    )
      await selectConversation({ ...item, status: 'Active' });
  }

  async function openRecentGoal(goalId: string) {
    if (goalId) await router.push(`/goals/${goalId}`);
  }
  async function openCreatedTask(taskId: string) {
    if (taskId) await router.push(`/tasks/${taskId}`);
  }
  async function openRecentKnowledgeNote(resourceId: string) {
    await requestOpenKnowledgeNote(resourceId);
  }

  function startNewConversation(mode: WorkflowMode | string = 'chat') {
    if (!canLeaveWorkflowReview()) return;
    ++newThreadSelectionEpoch;
    const normalizedMode = normalizeWorkflowMode(mode);
    chatSession.startNewConversation(normalizedMode);
    resetWorkflowArtifacts();
    toolMode.value = normalizedMode;
    syncSurfaceContext();
  }

  function exitToolMode() {
    if (!canLeaveWorkflowReview()) return;
    resetWorkflowArtifacts();
    toolMode.value = 'chat';
    if (!chatSession.chatConversationId.value && !chatSession.chatTimeline.value.length) {
      chatSession.conversationTitle.value = getDefaultConversationName('chat');
    }
  }

  bindChatViewLifecycle(
    {
      chatMessage: chatSession.chatMessage,
      chatTimeline: chatSession.chatTimeline,
      scrollMessagesToBottom: chatSession.scrollMessagesToBottom,
      abortActiveStream: chatSession.abortActiveStream,
      adjustComposerHeight,
    },
    { watch, onBeforeUnmount, nextTick: (cb) => void nextTick().then(cb) },
  );

  onBeforeUnmount(() => {
    disposed = true;
    referenceableKnowledgeNotes.cancel();
  });

  onMounted(async () => {
    // Reset before the first await: the composer is already visible and users
    // must be able to type a draft while the Agent Registry is still loading.
    chatSession.resetChatSession('chat', getDefaultConversationName);
    const selectionEpoch = ++newThreadSelectionEpoch;
    const selectionAtStart = explicitRuntimeSelection;
    try {
      await localChoices.refresh();
      const savedDefault = localChoices.defaultChoice.value;
      if (
        !disposed &&
        selectionAtStart === explicitRuntimeSelection &&
        !chatSession.chatConversationId.value &&
        chatSession.runtimeChoice.value.runtimeKind === 'builtin' &&
        savedDefault.runtimeKind === 'local_agent' &&
        selectionEpoch === newThreadSelectionEpoch &&
        !chatSession.chatTimeline.value.length &&
        localChoices.connections.value.some(
          (entry) => entry.id === savedDefault.connectionId && entry.enabled,
        )
      ) {
        // The initial reset happens before async I/O so drafts remain editable.
        // Apply the loaded native default without resetting the Composer again.
        chatSession.runtimeChoice.value = { ...savedDefault };
      }
      // Directory discovery is independent of history/provider initialization.
      // A slow native instance must not lock models already discovered for another.
      const directory = loadAgentRegistry();
      await initializeChatView({
        initRepository: loadRecentKnowledgeNotes,
        loadProviders,
        loadConversationList: loadWorkspaceLists,
        syncSelectedModel: modelSelection.syncSelectedModel,
        getPersistedModelKey: modelSelection.getPersistedModelKey,
        selectConversation,
        lastActiveConversationId: chatSession.lastActiveConversationId,
        conversationList: chatSession.conversationList,
        adjustComposerHeight,
        toastError: (msg: string) => toast.error(msg),
        translate: t,
        nextTick,
      });
      if (!disposed) composerInitializing.value = false;
      await directory;
    } finally {
      if (!disposed) composerInitializing.value = false;
    }
  });

  return {
    session: {
      runtimeChoice: chatSession.runtimeChoice,
      historyIncomplete: chatSession.historyIncomplete,
      respondNativeRequest: chatSession.respondNativeRequest,
      answerAskUser: chatSession.answerAskUser,
      cancelAskUser: chatSession.cancelAskUser,
      chatMessage: chatSession.chatMessage,
      chatLoading: chatSession.chatLoading,
      chatConversationId: chatSession.chatConversationId,
      chatTimeline: chatSession.chatTimeline,
      conversationTitle: chatSession.conversationTitle,
      conversationList: chatSession.conversationList,
      conversationStatuses: chatSession.conversationStatuses,
      conversationListLoading: chatSession.conversationListLoading,
      conversationProjectionLive: chatSession.conversationProjectionLive,
      recentGoalList,
      recentTaskList,
      recentKnowledgeNoteList,
      referenceGoalList,
      referenceTaskList,
      referenceKnowledgeNoteList,
      recentKnowledgeNotesEmailVerificationRequired: computed(
        () => recentKnowledgeNotes.emailVerificationRequired.value,
      ),
      recentKnowledgeNotesErrorMessageKey: computed(
        () => recentKnowledgeNotes.errorMessageKey.value,
      ),
      messagesViewport: chatSession.messagesViewport,
      lastRuntimeUsage: chatSession.lastRuntimeUsage,
      composerAttachments: chatSession.composerAttachments,
      composerContextEntities: chatSession.composerContextEntities,
      addComposerFiles: chatSession.addComposerFiles,
      removeComposerAttachment: chatSession.removeComposerAttachment,
      toggleExplicitContextEntity: chatSession.toggleExplicitContextEntity,
      removeContextEntity: chatSession.removeContextEntity,
      selectConversation,
      openRecentGoal,
      openRecentKnowledgeNote,
      archiveConversation: chatSession.archiveConversation,
      archiveConversations: chatSession.archiveConversations,
      restoreConversations: chatSession.restoreConversations,
      restoreConversation: restoreArchivedConversation,
      archivePage: chatSession.archivePage,
      archiveHasMore: chatSession.archiveHasMore,
      changeArchivePage: chatSession.changeArchivePage,
      deleteConversation: (id: string) =>
        chatSession.deleteConversation(
          id,
          service,
          persistence.clearWorkflowState,
          modelSelection.clearConversationModelSelection,
        ),
      loadConversationList: loadWorkspaceLists,
      startNewConversation,
      prepareWorkflowTurn: () =>
        chatSession.prepareWorkflowTurn(
          service,
          currentConversationLabel.value,
          adjustComposerHeight,
        ),
      handleSendChat: () =>
        chatSession.handleSendChat(
          service,
          modelSelection.selectedModel.value,
          currentConversationLabel.value,
          adjustComposerHeight,
        ),
      stopGenerating: () => chatSession.stopGenerating(),
      decideToolApproval: chatSession.decideToolApproval,
    },
    localAssistant: {
      ...localChoices,
      executionFailureMessage: computed(() =>
        getNativeAgentExecutionFailureMessage(localChoices.lastExecutionFailure.value, t),
      ),
      canSaveNote: Boolean(repository && knowledgeNativeSurface),
      saveNote: saveLocalNote,
      async select(choice: import('@memoflow/ai-contracts').AssistantRuntimeChoice) {
        const key =
          choice.runtimeKind === 'local_agent'
            ? `local:${choice.connectionId}`
            : 'agent:' + modelSelection.selectedAgentId.value;
        if (composerSwitchBlockedReason(key)) return;
        ++explicitRuntimeSelection;
        if (
          chatSession.runtimeChoice.value.runtimeKind !== choice.runtimeKind ||
          (choice.runtimeKind === 'local_agent' &&
            chatSession.runtimeChoice.value.runtimeKind === 'local_agent' &&
            chatSession.runtimeChoice.value.connectionId !== choice.connectionId)
        )
          permissionMode.value = 'supervised';
        chatSession.runtimeChoice.value = choice;
      },
      async setDefault() {
        try {
          await localChoices.saveDefault();
          toast.success(t('aiAssistant.local.defaultSaved'));
        } catch {
          toast.error(t('aiAssistant.local.actionFailed'));
        }
      },
    },
    model: {
      composerAgents,
      selectedComposerAgent,
      composerModels,
      composerCatalog,
      refreshComposerCatalog: refreshConfiguration,
      composerModelKey,
      modelCatalogLoading,
      composerLoading,
      permissionMode,
      currentNativeModelOptions,
      selectNativeModelOption,
      selectComposerModel,
      selectPermission,
      selectedModelKey: modelSelection.selectedModelKey,
      modelGroups: modelSelection.modelGroups,
      canSendMessage,
      selectModel(key: string) {
        const target = modelSelection.allModelOptions.value.find((model) => model.key === key);
        if (target)
          void selectComposerModel(
            key,
            target.agentInstanceId
              ? `agent:${target.agentInstanceId}`
              : selectedComposerAgent.value,
          );
      },
    },
    goalWorkflow,
    knowledgeQaWorkflow,
    taskWorkflow,
    knowledgeCaptureWorkflow,
    formatters,
    common: {
      toolMode,
      currentConversationLabel,
      currentToolLabel,
      exitToolMode,
      openSettings: () => void router.push('/settings?tab=ai'),
    },
  };
}
