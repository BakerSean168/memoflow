import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { useAI } from './useAI';
import { useGoal } from '../../goal/composables/useGoal';
import { useRecentKnowledgeNotes } from '../../repository/composables/useRecentKnowledgeNotes';
import { useAIChatSession } from './useAIChatSession';
import { useAIModelSelection } from './useAIModelSelection';
import { useAIGoalWorkflow } from './useAIGoalWorkflow';
import { useAITaskWorkflow } from './useAITaskWorkflow';
import { useAIKnowledgeCapture } from './useAIKnowledgeCapture';
import { useAIKnowledgeQaWorkflow } from './useAIKnowledgeQaWorkflow';
import { useAIWorkflowPersistence } from './useAIWorkflowPersistence';
import { useAIFormatters } from './useAIFormatters';
import { getToolLocaleKey, normalizeWorkflowMode } from './types';
import {
  adjustComposerHeight as createAdjustComposerHeight,
  bindChatViewLifecycle,
  getWorkflowStatusText,
  initializeChatView,
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
  ConversationSummary,
  ProviderListItem,
  WorkflowMode,
} from './types';

export interface UseAIChatViewOptions {
  getComposerTextarea: () => HTMLTextAreaElement | null;
}

/**
 * Thin AI workspace projection over the canonical Mastra Assistant/Workflow clients.
 * The UI owns presentation state only; runtime lifecycle stays server-owned.
 */
export function useAIChatView(options: UseAIChatViewOptions) {
  const { t } = useI18n();
  const router = useRouter();
  const { service, providers, loadProviders } = useAI();
  const assistantRuntime = useStrictInject(AI_ASSISTANT_RUNTIME_KEY, 'AIAssistantRuntime');
  const runtimeUsage = useStrictInject(AI_RUNTIME_USAGE_KEY, 'AIRuntimeUsage');
  const workflowRuntime = useStrictInject(AI_WORKFLOW_RUNTIME_KEY, 'AIWorkflowRuntime');
  const assistantSurface = useStrictInject(ASSISTANT_SURFACE_KEY, 'AIRuntimeSurface');
  const { goals, fetchGoals, createGoal } = useGoal();
  const recentKnowledgeNotes = useRecentKnowledgeNotes();
  const formatters = useAIFormatters();

  async function requestOpenKnowledgeNote(noteId: string): Promise<void> {
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

  const recentKnowledgeNoteList = computed<AIWorkspaceRecentKnowledgeNote[]>(() =>
    [...recentKnowledgeNotes.notes.value]
      .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt))
      .slice(0, 5)
      .map((note) => ({
        id: note.id,
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
    createGoal,
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
    hasWorkflowUserMessages: chatSession.hasWorkflowUserMessages,
    buildConversationTranscript: chatSession.buildConversationTranscript,
    scrollMessagesToBottom: chatSession.scrollMessagesToBottom,
    maybeRenameCurrentConversation,
  });

  const knowledgeCaptureWorkflow = useAIKnowledgeCapture({
    workflowRuntime,
    selectedModel: modelSelection.selectedModel,
    chatConversationId: chatSession.chatConversationId,
    chatLoading: chatSession.chatLoading,
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
    knowledgeAnswer: knowledgeQaWorkflow.knowledgeAnswer,
    clarificationAnswers: goalWorkflow.clarificationAnswers,
    editableGoal: goalWorkflow.editableGoal,
    editableKeyResults: goalWorkflow.editableKeyResults,
    editableTasks: goalWorkflow.editableTasks,
    editableKnowledge: goalWorkflow.editableKnowledge,
    showGoalDraftEditor: goalWorkflow.showGoalDraftEditor,
    resetWorkflowArtifacts,
  });

  async function refreshRestoredWorkflowRuns() {
    const goalRunId = goalWorkflow.goalWorkflowRun.value?.runId;
    if (goalRunId) await goalWorkflow.syncGoalWorkflowRun(goalRunId);
    const taskRunId = taskWorkflow.taskWorkflowRun.value?.runId;
    if (taskRunId) await taskWorkflow.syncTaskWorkflowRun(taskRunId);
    const captureRunId = knowledgeCaptureWorkflow.knowledgeCaptureRun.value?.runId;
    if (captureRunId) await knowledgeCaptureWorkflow.syncKnowledgeCaptureRun(captureRunId);
  }

  async function restoreWorkflowState(conversationId: string) {
    persistence.restoreWorkflowState(conversationId);
    await refreshRestoredWorkflowRuns();
    persistence.persistWorkflowState(conversationId);
  }

  async function loadWorkspaceLists() {
    await Promise.all([
      chatSession.loadConversationList(service),
      fetchGoals().catch(() => undefined),
      loadRecentKnowledgeNotes().catch(() => undefined),
    ]);
  }

  persistence.bindPersistenceWatcher(chatSession.chatConversationId);

  const currentConversationLabel = computed(
    () => chatSession.conversationTitle.value || getDefaultConversationName(toolMode.value),
  );
  const currentToolLabel = computed(() =>
    toolMode.value === 'chat'
      ? t('aiAssistant.chatPage.workflow.tools.chat')
      : t(`aiAssistant.chatPage.workflow.tools.${getToolLocaleKey(toolMode.value)}`),
  );
  const currentToolButtonLabel = computed(() =>
    toolMode.value === 'chat'
      ? t('aiAssistant.chatPage.workflow.toolButton')
      : currentToolLabel.value,
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

  async function selectConversation(item: ConversationSummary) {
    persistence.suspendWorkflowPersistence.value = true;
    try {
      await chatSession.selectConversation(
        item,
        service,
        modelSelection.syncSelectedModel,
        modelSelection.getPersistedModelKey,
      );
      await restoreWorkflowState(item.id);
    } finally {
      persistence.suspendWorkflowPersistence.value = false;
    }
  }

  async function openRecentGoal(goalId: string) {
    if (goalId) await router.push(`/goals/${goalId}`);
  }
  async function openRecentKnowledgeNote(resourceId: string) {
    await requestOpenKnowledgeNote(resourceId);
  }

  function startNewConversation(mode: WorkflowMode | string = 'chat') {
    const normalizedMode = normalizeWorkflowMode(mode);
    chatSession.startNewConversation(normalizedMode);
    resetWorkflowArtifacts();
    toolMode.value = normalizedMode;
  }

  function exitToolMode() {
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
      recentKnowledgeNoteList,
      recentKnowledgeNotesEmailVerificationRequired: computed(
        () => recentKnowledgeNotes.emailVerificationRequired.value,
      ),
      recentKnowledgeNotesErrorMessageKey: computed(
        () => recentKnowledgeNotes.errorMessageKey.value,
      ),
      messagesViewport: chatSession.messagesViewport,
      lastRuntimeUsage: chatSession.lastRuntimeUsage,
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
      handleSendChat: () =>
        chatSession.handleSendChat(
          service,
          modelSelection.selectedModel.value,
          currentConversationLabel.value,
          adjustComposerHeight,
        ),
      stopGenerating: () => chatSession.stopGenerating(),
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
      currentToolButtonLabel,
      workflowStatusText,
      canRunWorkflowActions,
      exitToolMode,
      openSettings: () => void router.push('/settings'),
    },
  };
}
