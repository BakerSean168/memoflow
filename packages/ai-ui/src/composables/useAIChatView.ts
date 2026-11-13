import { aiUiHost } from '../ai-ui-host';
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import {
  KnowledgeDocumentIdSchema,
  type KnowledgeDocumentRef,
} from '@memoflow/repository-contracts';
import { useAI } from './useAI';
import { useAIModelCatalog, sharedAIModelCatalogState } from './useAIModelCatalog';
import { useLocalAssistantChoices } from './useLocalAssistantChoices';
import { getNativeAgentExecutionFailureMessage } from './error';
import { useAIChatSession } from './useAIChatSession';
import { useComposerModelSelection } from './useComposerModelSelection';
import { useAIChatWorkflowProjection } from './useAIChatWorkflowProjection';
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
  const catalog = useAIModelCatalog(
    {
      resolveIdentity,
      registry: agentRegistryClient,
      native: localAgent,
      refreshProviderModels,
      autoRevalidate: true,
    },
    // Application-level directory: an AIChatView remount re-presents the last
    // verified catalog instead of losing it and re-probing every native driver.
    sharedAIModelCatalogState(agentRegistryClient ?? localAgent),
  );
  const configurationRevision = inject(AI_CONFIGURATION_REVISION_KEY, undefined);
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
        // Re-read the persisted snapshot after each turn. This is the fallback
        // confirmation: the catalog event is primary and neither path starts
        // another native process.
        void localChoices.probe(connectionId, { fresh: true });
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

  const composerModel = useComposerModelSelection({
    providers,
    loadProviders,
    resolveIdentity,
    catalog,
    localAgent,
    agentRegistryClient,
    configurationRevision,
    chatSession,
    localChoices,
    isWorkflowSelectionLocked: () => workflowSelectionLocked.value,
  });
  const {
    modelSelection,
    permissionMode,
    composerInitializing,
    composerLoading,
    modelCatalogLoading,
    loadAgentRegistry,
    currentNativeModelOptions,
    selectNativeModelOption,
    composerAgents,
    selectedComposerAgent,
    composerCatalog,
    composerModels,
    composerModelKey,
    composerSwitchBlockedReason,
    selectComposerModel,
    selectPermission,
  } = composerModel;

  async function maybeRenameCurrentConversation(name: string) {
    const id = chatSession.chatConversationId.value;
    const item = chatSession.conversationList.value.find((entry) => entry.id === id);
    // Workflow suggestions must also respect any previous automatic/manual title write.
    if (!item || (item.version ?? 1) !== 1) return;
    await chatSession.renameConversation(id, name);
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

  const { restoreWorkflowState } = useAIChatWorkflowProjection({
    workflowRuntime,
    runtimeChoice: chatSession.runtimeChoice,
    toolMode,
    persistence,
    goalWorkflow,
    taskWorkflow,
    knowledgeCaptureWorkflow,
    maybeRenameCurrentConversation,
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
  async function canLeaveWorkflowReview(): Promise<boolean> {
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
    if (!(await canLeaveWorkflowReview())) return;
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

  async function startNewConversation(mode: WorkflowMode | string = 'chat') {
    if (!(await canLeaveWorkflowReview())) return;
    composerModel.bumpNewThreadSelectionEpoch();
    const normalizedMode = normalizeWorkflowMode(mode);
    chatSession.startNewConversation(normalizedMode);
    // A new chat inherits the explicit new-session default or the last choice;
    // workflow modes stay on their builtin runtime.
    if (normalizedMode === 'chat') composerModel.applyNewSessionSelection();
    resetWorkflowArtifacts();
    toolMode.value = normalizedMode;
    syncSurfaceContext();
  }

  async function exitToolMode() {
    if (!(await canLeaveWorkflowReview())) return;
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
    composerModel.markDisposed();
    referenceableKnowledgeNotes.cancel();
  });

  onMounted(async () => {
    // Reset before the first await: the composer is already visible and users
    // must be able to type a draft while the Agent Registry is still loading.
    chatSession.resetChatSession('chat', getDefaultConversationName);
    const selectionEpoch = composerModel.bumpNewThreadSelectionEpoch();
    const selectionAtStart = composerModel.readExplicitRuntimeSelection();
    try {
      await localChoices.refresh();
      const savedDefault = localChoices.defaultChoice.value;
      const newSessionReady =
        !composerModel.isDisposed() &&
        selectionAtStart === composerModel.readExplicitRuntimeSelection() &&
        !chatSession.chatConversationId.value &&
        selectionEpoch === composerModel.readNewThreadSelectionEpoch() &&
        !chatSession.chatTimeline.value.length;
      // The explicit new-session default and sticky memory fill the empty
      // Composer first; the runtime default is only a last resort.
      const restoredFromMemory =
        newSessionReady && composerModel.applyNewSessionSelection() !== 'none';
      if (
        !restoredFromMemory &&
        newSessionReady &&
        chatSession.runtimeChoice.value.runtimeKind === 'builtin' &&
        savedDefault.runtimeKind === 'local_agent' &&
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
      if (!composerModel.isDisposed()) composerInitializing.value = false;
      await directory;
    } finally {
      if (!composerModel.isDisposed()) composerInitializing.value = false;
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
      renameConversation: chatSession.renameConversation,
      titleBusy: chatSession.titleBusy,
      regenerateConversationTitle: (id: string) =>
        chatSession.generateConversationTitle(id, {
          model:
            id === chatSession.chatConversationId.value ? modelSelection.selectedModel.value : null,
        }),
      archiveConversations: chatSession.archiveConversations,
      restoreConversations: chatSession.restoreConversations,
      restoreConversation: restoreArchivedConversation,
      archivePage: chatSession.archivePage,
      archiveHasMore: chatSession.archiveHasMore,
      changeArchivePage: chatSession.changeArchivePage,
      deleteConversation: (id: string, silent = false) =>
        chatSession.deleteConversation(
          id,
          service,
          persistence.clearWorkflowState,
          modelSelection.clearConversationModelSelection,
          silent,
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
        composerModel.bumpExplicitRuntimeSelection();
        chatSession.runtimeChoice.value = choice;
        composerModel.rememberRuntimeChoice();
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
      // Opening the picker reads the presented directory. Only entries that were
      // never loaded or previously failed are discovered; it is not a full
      // configuration refresh.
      refreshComposerCatalog: () => catalog.ensureLoaded(),
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
