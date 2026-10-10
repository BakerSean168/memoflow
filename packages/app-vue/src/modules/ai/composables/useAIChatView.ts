import { useAIWorkflowReconciliation } from './useAIWorkflowReconciliation';
import { canLeaveBusinessSurface } from '../../../layouts/shell/surface-leave-protocol';
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
} from '@memoflow/contracts/repository';
import type {
  AIWorkflowRunView,
  AgentRegistrySnapshot,
  AIChatPermissionMode,
  AIModelInfo,
} from '@memoflow/contracts/ai';
import { useAI } from './useAI';
import { useGoal } from '../../goal/composables/useGoal';
import { useTask } from '../../task/composables/useTask';
import { useRecentKnowledgeNotes } from '../../repository/composables/useRecentKnowledgeNotes';
import { useReferenceableKnowledgeNotes } from '../../repository/composables/useReferenceableKnowledgeNotes';
import { useLocalAssistantChoices } from './useLocalAssistantChoices';
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
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import {
  AI_ASSISTANT_RUNTIME_KEY,
  AI_AGENT_REGISTRY_KEY,
  AI_CONFIGURATION_REVISION_KEY,
  AI_LOCAL_AGENT_KEY,
  REPOSITORY_SERVICE_KEY,
  AI_RUNTIME_USAGE_KEY,
  AI_WORKFLOW_RUNTIME_KEY,
  ASSISTANT_SURFACE_KEY,
} from '../../../di/keys';
import { useKnowledgeNativeSurfaceRegistration } from '../../../layouts/shell/useKnowledgeNativeSurface';
import { openLocalAgentNoteReview } from '../../repository/composables/localAgentNoteReview';
import { unwrapOrThrowError } from '@memoflow/contracts/result';
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
  const assistantRuntime = useStrictInject(AI_ASSISTANT_RUNTIME_KEY, 'AIAssistantRuntime');
  const runtimeUsage = useStrictInject(AI_RUNTIME_USAGE_KEY, 'AIRuntimeUsage');
  const workflowRuntime = useStrictInject(AI_WORKFLOW_RUNTIME_KEY, 'AIWorkflowRuntime');
  const assistantSurface = useStrictInject(ASSISTANT_SURFACE_KEY, 'AIRuntimeSurface');
  const localAgent = inject(AI_LOCAL_AGENT_KEY, undefined);
  const agentRegistryClient = inject(AI_AGENT_REGISTRY_KEY, undefined);
  const agentRegistrySnapshot = ref<AgentRegistrySnapshot | null>(null);
  const configurationRevision = inject(AI_CONFIGURATION_REVISION_KEY, undefined);
  const permissionMode = ref<AIChatPermissionMode>('supervised');
  const modelCatalogs = ref<Record<string, AIModelInfo[]>>({});
  const modelCatalogLoading = ref(false);
  const catalogRequests = new Map<string, Promise<AIModelInfo[]>>();
  function requestCatalog(connectionId: string) {
    let request = catalogRequests.get(connectionId);
    if (!request) {
      request = Promise.resolve()
        .then(() => refreshProviderModels(connectionId))
        .then((result) => result.models)
        .catch(() => {
          catalogRequests.delete(connectionId);
          return [];
        });
      catalogRequests.set(connectionId, request);
    }
    return request;
  }
  let registryGeneration = 0;
  let disposed = false;
  async function loadAgentRegistry() {
    if (!agentRegistryClient) return;
    const generation = ++registryGeneration;
    try {
      const next = await agentRegistryClient.list();
      if (disposed || generation !== registryGeneration) return;
      agentRegistrySnapshot.value = next;
      modelCatalogLoading.value = true;
      const connectionIds = [
        ...new Set(
          next.bindings
            .filter((binding) =>
              next.instances.some(
                (instance) => instance.instanceId === binding.instanceId && instance.enabled,
              ),
            )
            .map((binding) => binding.connectionId),
        ),
      ];
      const entries: Array<[string, AIModelInfo[]]> = [];
      for (
        let i = 0;
        i < connectionIds.length && !disposed && generation === registryGeneration;
        i += 2
      )
        entries.push(
          ...(await Promise.all(
            connectionIds
              .slice(i, i + 2)
              .map(async (id): Promise<[string, AIModelInfo[]]> => [id, await requestCatalog(id)]),
          )),
        );
      if (!disposed && generation === registryGeneration)
        modelCatalogs.value = Object.fromEntries(entries);
    } catch {
      // Fail closed: never expose global legacy providers as another Agent's models.
      if (!disposed && generation === registryGeneration) {
        agentRegistrySnapshot.value = null;
        modelCatalogs.value = {};
      }
    } finally {
      if (!disposed && generation === registryGeneration) modelCatalogLoading.value = false;
    }
  }
  const repository = inject(REPOSITORY_SERVICE_KEY, undefined);
  const knowledgeNativeSurface = useKnowledgeNativeSurfaceRegistration();
  async function saveLocalNote(content: string) {
    if (!localAgent || !repository || !knowledgeNativeSurface) return;
    try {
      const binding = unwrapOrThrowError(await repository.getLocalVaultBinding());
      if (!binding || binding.health.state !== 'Available')
        throw new Error('Select an available local Vault first');
      await openLocalAgentNoteReview({
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
  const { goals, fetchGoals } = useGoal();
  const task = useTask();
  const recentKnowledgeNotes = useRecentKnowledgeNotes();
  const referenceableKnowledgeNotes = useReferenceableKnowledgeNotes();
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
    localAgent,
    getPermissionMode: () => permissionMode.value,
    getDefaultRuntimeChoice: () => localChoices.defaultChoice.value,
    usageRuntime: runtimeUsage,
    surface: assistantSurface,
    getDefaultConversationName,
    onConversationCreated: persistWorkflowAndModel,
  });

  const localChoices = useLocalAssistantChoices(localAgent, chatSession.runtimeChoice);

  const modelSelection = useAIModelSelection({
    providers: providerList,
    ...(agentRegistryClient ? { agentRegistrySnapshot, modelCatalogs } : {}),
    chatConversationId: chatSession.chatConversationId,
    ...(agentRegistryClient?.conversationSelection
      ? {
          readConversationSelection: (id: string) => agentRegistryClient.conversationSelection!(id),
        }
      : {}),
  });

  const composerAgents = computed(() => {
    const entries = agentRegistrySnapshot.value?.instances ?? [];
    return entries.map((instance) => ({
      id:
        instance.driver === 'mastra'
          ? `agent:${instance.instanceId}`
          : `local:${instance.legacyConnectionId ?? instance.instanceId}`,
      name: instance.name,
      driver: instance.driver,
      enabled: instance.enabled,
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
  const composerModels = computed(() => {
    const choice = chatSession.runtimeChoice.value;
    if (choice.runtimeKind === 'local_agent')
      return localChoices.models.value.map((model) => ({
        key: model.id,
        providerId: choice.connectionId,
        providerName: 'Native Agent',
        modelId: model.id,
        modelName: model.name,
      }));
    return modelSelection.selectedAgentModels.value;
  });
  const composerModelKey = computed(() =>
    chatSession.runtimeChoice.value.runtimeKind === 'local_agent'
      ? chatSession.runtimeChoice.value.modelId
      : modelSelection.selectedModelKey.value,
  );
  async function refreshConfiguration() {
    catalogRequests.clear();
    await Promise.allSettled([loadProviders(), loadAgentRegistry(), localChoices.refresh()]);
  }
  if (configurationRevision) {
    watch(configurationRevision, () => {
      catalogRequests.clear();
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
  async function selectComposerAgent(key: string) {
    if (chatSession.chatLoading.value || !canLeaveWorkflowReview()) return;
    if (key === selectedComposerAgent.value) return;
    if (key.startsWith('local:')) {
      const id = key.slice(6);
      const connection = localChoices.connections.value.find(
        (entry) => entry.id === id && entry.enabled,
      );
      if (!connection) {
        await router.push('/settings?tab=ai');
        return;
      }
      startNewConversation();
      chatSession.runtimeChoice.value = {
        runtimeKind: 'local_agent',
        connectionId: id,
        modelId: '',
      };
      permissionMode.value = 'supervised';
      return;
    }
    const id = key.slice(6);
    const eligible = agentRegistrySnapshot.value?.instances.some(
      (entry) => entry.instanceId === id && entry.driver === 'mastra' && entry.enabled,
    );
    if (!eligible) return;
    const wasNative = chatSession.runtimeChoice.value.runtimeKind === 'local_agent';
    const result = wasNative ? 'new_conversation_required' : modelSelection.selectAgent(id);
    if (result === 'new_conversation_required') {
      startNewConversation();
      chatSession.runtimeChoice.value = { runtimeKind: 'builtin' };
      modelSelection.selectAgent(id);
      toast.info(t('aiAssistant.agentSwitchNewConversation'));
    }
    permissionMode.value = 'supervised';
  }
  function selectComposerModel(key: string) {
    if (chatSession.chatLoading.value || !canLeaveWorkflowReview()) return;
    const choice = chatSession.runtimeChoice.value;
    if (choice.runtimeKind === 'local_agent') {
      if (localChoices.models.value.some((model) => model.id === key))
        chatSession.runtimeChoice.value = { ...choice, modelId: key };
      return;
    }
    if (modelSelection.selectModel(key) === 'new_conversation_required') {
      if (!modelSelection.allModelOptions.value.some((model) => model.key === key)) return;
      startNewConversation(toolMode.value);
      chatSession.runtimeChoice.value = { runtimeKind: 'builtin' };
      modelSelection.selectModel(key);
      toast.info(t('aiAssistant.agentSwitchNewConversation'));
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
    chatSession.conversationTitle.value = nextName;
    await maybeRenameConversation(
      nextName,
      currentTitle,
      chatSession.chatConversationId.value,
      service,
      () => chatSession.loadConversationList(service),
    );
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

  const canSendMessage = computed(
    () =>
      !chatSession.chatLoading.value &&
      (chatSession.runtimeChoice.value.runtimeKind === 'local_agent'
        ? localChoices.canSend.value
        : modelSelection.canSendMessage.value && modelSelection.selectedModel.value !== null),
  );
  function canLeaveWorkflowReview(): boolean {
    return canLeaveAIWorkflowReview(
      toolMode.value,
      {
        goal: goalWorkflow.goalAgentResuming.value || goalWorkflow.goalOwnerAttemptPending.value,
        task: taskWorkflow.taskAgentResuming.value || taskWorkflow.taskOwnerAttemptPending.value,
        knowledge: knowledgeCaptureWorkflow.knowledgeCaptureResuming.value,
      },
      // Chat/Q&A lifecycle does not leave the visible business surface.
      () =>
        toolMode.value === 'chat' ||
        toolMode.value === 'knowledge-qa' ||
        canLeaveBusinessSurface(t),
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
    registryGeneration++;
    referenceableKnowledgeNotes.cancel();
  });

  onMounted(async () => {
    await localChoices.refresh();
    await loadAgentRegistry();
    await initializeChatView({
      initRepository: loadRecentKnowledgeNotes,
      loadProviders,
      loadConversationList: loadWorkspaceLists,
      syncSelectedModel: modelSelection.syncSelectedModel,
      getPersistedModelKey: modelSelection.getPersistedModelKey,
      selectConversation,
      resetChatSession: chatSession.resetChatSession,
      getDefaultConversationName,
      lastActiveConversationId: chatSession.lastActiveConversationId,
      conversationList: chatSession.conversationList,
      adjustComposerHeight,
      toastError: (msg: string) => toast.error(msg),
      translate: t,
      nextTick,
    });
  });

  return {
    session: {
      runtimeChoice: chatSession.runtimeChoice,
      historyIncomplete: chatSession.historyIncomplete,
      respondNativeRequest: chatSession.respondNativeRequest,
      chatMessage: chatSession.chatMessage,
      chatLoading: chatSession.chatLoading,
      chatConversationId: chatSession.chatConversationId,
      chatTimeline: chatSession.chatTimeline,
      conversationTitle: chatSession.conversationTitle,
      conversationList: chatSession.conversationList,
      conversationListLoading: chatSession.conversationListLoading,
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
      canSaveNote: Boolean(repository && knowledgeNativeSurface),
      saveNote: saveLocalNote,
      async select(choice: import('@memoflow/contracts/ai').AssistantRuntimeChoice) {
        if (chatSession.chatLoading.value) return;
        if (!canLeaveWorkflowReview()) return;
        const previous = chatSession.runtimeChoice.value;
        if (!(
          previous.runtimeKind === 'local_agent' &&
          choice.runtimeKind === 'local_agent' &&
          previous.connectionId === choice.connectionId
        ))
          startNewConversation();
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
      composerModelKey,
      modelCatalogLoading,
      permissionMode,
      selectComposerAgent,
      selectComposerModel,
      selectPermission,
      selectedModelKey: modelSelection.selectedModelKey,
      modelGroups: modelSelection.modelGroups,
      canSendMessage,
      selectModel(key: string) {
        if (chatSession.chatLoading.value || !canLeaveWorkflowReview()) return;
        const fromNative = chatSession.runtimeChoice.value.runtimeKind === 'local_agent';
        if (fromNative || modelSelection.selectModel(key) === 'new_conversation_required') {
          if (!modelSelection.allModelOptions.value.some((model) => model.key === key)) return;
          startNewConversation(toolMode.value);
          chatSession.runtimeChoice.value = { runtimeKind: 'builtin' };
          modelSelection.selectModel(key);
          toast.info(t('aiAssistant.agentSwitchNewConversation'));
        }
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
