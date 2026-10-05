import { canLeaveBusinessSurface } from '../../../layouts/shell/surface-leave-protocol';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import {
  KnowledgeDocumentIdSchema,
  type KnowledgeDocumentRef,
} from '@memoflow/contracts/repository';
import { useAI } from './useAI';
import { useGoal } from '../../goal/composables/useGoal';
import { useTask } from '../../task/composables/useTask';
import { useRecentKnowledgeNotes } from '../../repository/composables/useRecentKnowledgeNotes';
import { useReferenceableKnowledgeNotes } from '../../repository/composables/useReferenceableKnowledgeNotes';
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
  adjustComposerHeight as createAdjustComposerHeight,
  bindChatViewLifecycle,
  getWorkflowStatusText,
  initializeChatView,
  AIWorkflowRestoreError,
  loadAuthoritativeWorkflowRun,
  maybeRenameConversation,
} from './chatViewHelpers';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import {
  AI_ASSISTANT_RUNTIME_KEY,
  AI_RUNTIME_USAGE_KEY,
  AI_WORKFLOW_RUNTIME_KEY,
  ASSISTANT_SURFACE_KEY,
} from '../../../di/keys';
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
  const { service, providers, loadProviders } = useAI();
  const assistantRuntime = useStrictInject(AI_ASSISTANT_RUNTIME_KEY, 'AIAssistantRuntime');
  const runtimeUsage = useStrictInject(AI_RUNTIME_USAGE_KEY, 'AIRuntimeUsage');
  const workflowRuntime = useStrictInject(AI_WORKFLOW_RUNTIME_KEY, 'AIWorkflowRuntime');
  const assistantSurface = useStrictInject(ASSISTANT_SURFACE_KEY, 'AIRuntimeSurface');
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

  const providerList = computed<ProviderListItem[]>(() => providers.value);
  const persistWorkflowAndModel = (id: string) => {
    persistence.persistWorkflowState(id);
    modelSelection.persistSelectedModel(modelSelection.selectedModelKey.value, id);
  };

  const chatSession = useAIChatSession({
    service,
    runtime: assistantRuntime,
    usageRuntime: runtimeUsage,
    surface: assistantSurface,
    getDefaultConversationName,
    onConversationCreated: persistWorkflowAndModel,
  });

  const modelSelection = useAIModelSelection({
    providers: providerList,
    chatConversationId: chatSession.chatConversationId,
  });

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
      persistence.applyEditorOverlay(persisted.editorOverlay, run);
      // Rebase or discard any stale overlay against the runtime revision.
      persistence.persistWorkflowState(conversationId);
      if (run.kind === 'goal.create') await goalWorkflow.openGoalNativeReview();
      if (run.kind === 'task.create') await taskWorkflow.openTaskNativeReview();
      if (run.kind === 'knowledge.capture')
        await knowledgeCaptureWorkflow.openKnowledgeNativeReview();
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

  const currentConversationLabel = computed(
    () => chatSession.conversationTitle.value || getDefaultConversationName(toolMode.value),
  );
  const currentToolLabel = computed(() =>
    toolMode.value === 'chat'
      ? t('aiAssistant.chatPage.workflow.tools.chat')
      : t(`aiAssistant.chatPage.workflow.tools.${getToolLocaleKey(toolMode.value)}`),
  );
  const workflowStatusText = computed(() =>
    getWorkflowStatusText(
      {
        toolMode: toolMode.value,
        goalDraftLoading: goalWorkflow.goalDraftLoading.value,
        goalWorkflowStage: goalWorkflow.goalWorkflowStage.value,
        automationLoading: goalWorkflow.automationLoading.value,
        automationExecuting: goalWorkflow.automationExecuting.value,
        goalExecutionSummary: goalWorkflow.goalExecutionSummary.value,
        knowledgeQueryLoading: knowledgeQaWorkflow.knowledgeQueryLoading.value,
        knowledgeAnswer: knowledgeQaWorkflow.knowledgeAnswer.value,
        taskAgentLoading: taskWorkflow.taskAgentLoading.value,
        taskWorkflowRun: taskWorkflow.taskWorkflowRun.value,
        knowledgeCaptureLoading: knowledgeCaptureWorkflow.knowledgeCaptureLoading.value,
        knowledgeCaptureRun: knowledgeCaptureWorkflow.knowledgeCaptureRun.value,
      },
      t,
      formatters.formatExecutionOutcome,
    ),
  );

  const canSendMessage = computed(
    () =>
      modelSelection.canSendMessage.value &&
      !chatSession.chatLoading.value &&
      modelSelection.selectedModel.value !== null,
  );
  const canRunWorkflowActions = computed(
    () =>
      modelSelection.selectedModel.value !== null &&
      !chatSession.chatLoading.value &&
      !knowledgeQaWorkflow.knowledgeQueryLoading.value &&
      !taskWorkflow.taskAgentLoading.value &&
      !knowledgeCaptureWorkflow.knowledgeCaptureLoading.value,
  );

  function canLeaveTaskReview(): boolean {
    if (toolMode.value !== 'task-create') return true;
    if (taskWorkflow.taskAgentResuming.value || taskWorkflow.taskOwnerAttemptPending.value) {
      toast.info(t('shell.panel.busyTransitionHint'));
      return false;
    }
    return canLeaveBusinessSurface(t);
  }

  async function selectConversation(item: ConversationSummary) {
    if (!canLeaveTaskReview()) return;
    persistence.suspendWorkflowPersistence.value = true;
    try {
      await chatSession.selectConversation(
        item,
        service,
        modelSelection.syncSelectedModel,
        modelSelection.getPersistedModelKey,
      );
      await restoreWorkflowState(item.id);
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
    if (!canLeaveTaskReview()) return;
    const normalizedMode = normalizeWorkflowMode(mode);
    chatSession.startNewConversation(normalizedMode);
    resetWorkflowArtifacts();
    toolMode.value = normalizedMode;
    syncSurfaceContext();
  }

  function exitToolMode() {
    if (!canLeaveTaskReview()) return;
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
    referenceableKnowledgeNotes.cancel();
  });

  onMounted(() =>
    initializeChatView({
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
    }),
  );

  return {
    session: {
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
    model: {
      selectedModelKey: modelSelection.selectedModelKey,
      modelGroups: modelSelection.modelGroups,
      canSendMessage,
      selectModel: (key: string) => modelSelection.selectModel(key),
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
      workflowStatusText,
      canRunWorkflowActions,
      exitToolMode,
      openSettings: () => void router.push('/settings'),
    },
  };
}
