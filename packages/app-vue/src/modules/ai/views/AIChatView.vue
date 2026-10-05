<template>
  <div
    class="flex min-h-0 overflow-hidden bg-transparent"
    :class="composerOnly ? 'h-auto' : 'h-full'"
    data-testid="ai-chat-view"
  >
    <AIConversationSidebar
      v-if="!hideConversationSidebar && !composerOnly"
      :conversations="conversationList"
      :recent-goals="recentGoalList"
      :recent-knowledge-notes="recentKnowledgeNoteList"
      :recent-knowledge-notes-email-verification-required="
        recentKnowledgeNotesEmailVerificationRequired
      "
      :recent-knowledge-notes-error-message-key="recentKnowledgeNotesErrorMessageKey"
      :active-conversation-id="chatConversationId"
      :loading="conversationListLoading"
      @new-conversation="startNewConversation()"
      @refresh="loadConversationList"
      @open-settings="openSettings"
      @select="selectConversation"
      @select-goal="openRecentGoal"
      @select-knowledge-note="openRecentKnowledgeNote"
      @delete="deleteConversation"
    />

    <div
      v-if="mobileSidebarOpen"
      class="fixed inset-0 z-50 md:hidden"
      data-testid="ai-mobile-sidebar-panel"
    >
      <button
        type="button"
        class="absolute inset-0 bg-background/80 backdrop-blur-sm"
        :aria-label="t('aiAssistant.chatPage.sidebar.close')"
        data-testid="ai-mobile-sidebar-backdrop"
        @click="closeMobileSidebar"
      />
      <div class="relative h-full w-[min(22rem,calc(100vw-3rem))] border-r bg-sidebar shadow-xl">
        <AIConversationSidebar
          variant="mobile"
          show-close
          :conversations="conversationList"
          :recent-goals="recentGoalList"
          :recent-knowledge-notes="recentKnowledgeNoteList"
          :recent-knowledge-notes-email-verification-required="
            recentKnowledgeNotesEmailVerificationRequired
          "
          :recent-knowledge-notes-error-message-key="recentKnowledgeNotesErrorMessageKey"
          :active-conversation-id="chatConversationId"
          :loading="conversationListLoading"
          @new-conversation="startNewConversationFromMobile"
          @refresh="loadConversationList"
          @open-settings="openSettingsFromMobile"
          @close="closeMobileSidebar"
          @select="selectConversationFromMobile"
          @select-goal="openRecentGoalFromMobile"
          @select-knowledge-note="openRecentKnowledgeNoteFromMobile"
          @delete="deleteConversation"
        />
      </div>
    </div>

    <section class="@container/ai flex min-w-0 flex-1 flex-col overflow-hidden">
      <header
        v-show="!composerOnly"
        class="flex h-9 shrink-0 items-center border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.58)] px-4 @md/ai:px-5"
        data-testid="ai-chat-header"
      >
        <div class="flex w-full items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <h1 class="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
              {{ currentConversationLabel }}
            </h1>
            <span
              v-if="toolMode !== 'chat'"
              data-testid="ai-active-intent"
              class="hidden shrink-0 rounded-full border border-border/60 bg-muted/35 px-2 py-0.5 text-[10px] font-medium text-muted-foreground @sm/ai:inline-flex"
            >
              {{ currentToolLabel }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <AIRuntimeUsageBadge :usage="lastRuntimeUsage" />
            <Button
              v-if="hasWorkflowContext"
              variant="ghost"
              size="icon"
              class="hidden h-8 w-8 md:inline-flex"
              :aria-label="
                contextPanelOpen
                  ? t('aiAssistant.chatPage.workbench.hide')
                  : t('aiAssistant.chatPage.workbench.show')
              "
              :title="
                contextPanelOpen
                  ? t('aiAssistant.chatPage.workbench.hide')
                  : t('aiAssistant.chatPage.workbench.show')
              "
              data-testid="ai-desktop-context-panel-toggle"
              @click="toggleContextPanel"
            >
              <PanelRightOpen class="h-4 w-4" />
            </Button>
            <div class="flex items-center gap-1 md:hidden">
              <Button
                variant="ghost"
                size="icon"
                :aria-label="t('aiAssistant.chatPage.sidebar.open')"
                class="h-8 w-8"
                :title="t('aiAssistant.chatPage.sidebar.open')"
                data-testid="ai-mobile-sidebar-toggle"
                @click="openMobileSidebar"
              >
                <Menu class="h-4 w-4" />
              </Button>
              <Button
                v-if="hasWorkflowContext"
                variant="ghost"
                size="icon"
                :aria-label="
                  contextPanelOpen
                    ? t('aiAssistant.chatPage.workbench.hide')
                    : t('aiAssistant.chatPage.workbench.show')
                "
                class="h-8 w-8"
                :title="
                  contextPanelOpen
                    ? t('aiAssistant.chatPage.workbench.hide')
                    : t('aiAssistant.chatPage.workbench.show')
                "
                data-testid="ai-context-panel-toggle"
                @click="toggleContextPanel"
              >
                <PanelRightOpen class="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                :aria-label="t('aiAssistant.dialogs.chat.newConversation')"
                class="h-8 w-8"
                :title="t('aiAssistant.dialogs.chat.newConversation')"
                @click="startNewConversation()"
              >
                <Plus class="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <AIMessagePanel
        v-show="!composerOnly"
        ref="messagePanelRef"
        :timeline="chatTimeline"
        :tool-mode="toolMode"
        :has-models="modelGroups.length > 0"
        @select-shortcut="handleWelcomeShortcut"
        @configure-ai="openAISettings"
        @create-goal="openGoalWithoutAI"
        @quick-task="openQuickTaskWithoutAI"
        @tool-decision="decideToolApproval"
      />

      <Teleport :to="shellComposerMount ?? 'body'" :disabled="!shellComposerMount">
        <AIFooterComposer
          ref="composerRef"
          v-model="chatMessage"
          :loading="chatLoading"
          :can-send="canSendMessage"
          :attachments="composerAttachments"
          :context-entities="composerContextEntities"
          :recent-goals="referenceGoalList"
          :recent-tasks="referenceTaskList"
          :recent-knowledge-notes="referenceKnowledgeNoteList"
          :model-groups="modelGroups"
          :selected-model-key="selectedModelKey"
          :density="composerDensity"
          @send="handleComposerSend"
          @stop="stopGenerating"
          @select-model="selectModel"
          @open-settings="openAISettings"
          @add-files="addComposerFiles"
          @remove-attachment="removeComposerAttachment"
          @toggle-context-entity="toggleExplicitContextEntity"
          @remove-context-entity="removeContextEntity"
        />
      </Teleport>
    </section>

    <Teleport to="body" :disabled="true">
      <AIContextPanel
        v-show="!composerOnly"
        :has-workflow-context="hasWorkflowContext"
        :open="contextPanelOpen"
        :tool-label="currentToolLabel"
        @close="closeContextPanel"
      >
        <AIGoalWorkflowPanel
          :tool-mode="toolMode"
          :goal-clarification="goalClarification"
          :goal-workflow-run="goalWorkflowRun"
          :editable-goal="editableGoal"
          :editable-key-results="editableKeyResults"
          :editable-tasks="editableTasks"
          :editable-knowledge="editableKnowledge"
          :goal-owner-submitted="goalOwnerSubmitted"
          :busy="goalAgentResuming"
          :can-retry-execution="canRetryGoalAgentExecution"
          :can-accept-partial-execution="canAcceptGoalPartialExecution"
          :can-cancel-remaining-execution="canCancelRemainingGoalExecution"
          :knowledge-answer="knowledgeAnswer"
          :format-execution-outcome="formatExecutionOutcome"
          @open-native-review="openGoalNativeReview"
          @open-knowledge-citation="openKnowledgeCitation"
          @retry="retryGoalAgentExecution"
          @accept-partial="acceptPartialGoalExecution"
          @cancel-remaining="cancelRemainingGoalExecution"
        />
        <AITaskWorkflowPanel
          :tool-mode="toolMode"
          :task-workflow-run="taskWorkflowRun"
          :busy="taskAgentResuming"
          :owner-attempt-pending="taskOwnerAttemptPending"
          :owner-submitted="taskOwnerSubmitted"
          :can-retry-execution="canRetryTaskAgentExecution"
          :can-accept-partial-execution="canAcceptTaskPartialExecution"
          :can-cancel-remaining-execution="canCancelRemainingTaskExecution"
          @confirm="confirmTaskAgentRun"
          @cancel="cancelTaskAgentRun"
          @retry="retryTaskAgentExecution"
          @accept-partial="acceptPartialTaskExecution"
          @cancel-remaining="cancelRemainingTaskExecution"
          @open-native-review="openTaskNativeReview"
        />
        <AIKnowledgeCapturePanel
          :tool-mode="toolMode"
          :knowledge-capture-run="knowledgeCaptureRun"
          :busy="knowledgeCaptureResuming"
          :can-retry-execution="canRetryKnowledgeCaptureExecution"
          :can-cancel-remaining-execution="canCancelRemainingKnowledgeCaptureExecution"
          @cancel="cancelKnowledgeCaptureRun"
          @retry="retryKnowledgeCaptureExecution"
          @cancel-remaining="cancelRemainingKnowledgeCaptureExecution"
          @open-native-review="openKnowledgeNativeReview"
        />
        <div
          v-if="!hasWorkflowArtifact"
          class="rounded-lg border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground"
          data-testid="ai-context-empty-state"
        >
          {{ t('aiAssistant.chatPage.workbench.empty') }}
        </div>
      </AIContextPanel>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Menu, PanelRightOpen, Plus } from '@lucide/vue';
import { Button } from '@memoflow/ui-vue-shadcn';
import AIConversationSidebar from '../components/AIConversationSidebar.vue';
import AIMessagePanel from '../components/AIMessagePanel.vue';
import AIFooterComposer from '../components/AIFooterComposer.vue';
import AIGoalWorkflowPanel from '../components/AIGoalWorkflowPanel.vue';
import AITaskWorkflowPanel from '../components/AITaskWorkflowPanel.vue';
import AIKnowledgeCapturePanel from '../components/AIKnowledgeCapturePanel.vue';
import AIContextPanel from '../components/AIContextPanel.vue';
import AIRuntimeUsageBadge from '../components/AIRuntimeUsageBadge.vue';
import { useAppShellStore } from '../../../layouts/shell/useAppShellStore';
import { SHELL_COMPOSER_DENSITY_KEY, SHELL_COMPOSER_MOUNT_KEY } from '../../../di/keys';
import type { ComposerDensity } from '../../../layouts/shell/panel-geometry';
import { useAIChatView } from '../composables/useAIChatView';
import { inferWorkflowMode } from '../composables/workflowIntent';
import type { ConversationSummary, WorkflowMode } from '../composables/types';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

withDefaults(
  defineProps<{
    hideConversationSidebar?: boolean;
    composerOnly?: boolean;
  }>(),
  { hideConversationSidebar: false, composerOnly: false },
);

const shellComposerMountRef = inject(SHELL_COMPOSER_MOUNT_KEY, null);
const shellComposerDensityRef = inject(SHELL_COMPOSER_DENSITY_KEY, null);
const shellComposerMount = computed(() => shellComposerMountRef?.value ?? null);
const shellStore = shellComposerMountRef ? useAppShellStore() : null;
const composerDensity = computed<ComposerDensity>(
  () => shellComposerDensityRef?.value ?? 'comfortable',
);

const messagePanelRef = ref<{ viewport?: HTMLElement | null } | null>(null);
const composerRef = ref<{ composerTextarea?: HTMLTextAreaElement | null } | null>(null);

const {
  session,
  model,
  goalWorkflow,
  knowledgeQaWorkflow,
  taskWorkflow,
  knowledgeCaptureWorkflow,
  formatters,
  common,
} = useAIChatView({
  getComposerTextarea: () => composerRef.value?.composerTextarea ?? null,
  getActiveSurface: () => {
    if (
      !shellStore ||
      !shellStore.rightPanelOpen ||
      shellStore.panelSurface !== 'business' ||
      !shellStore.activeTab
    ) {
      return null;
    }
    return {
      module: shellStore.activeTab.module,
      route: shellStore.activeTab.route,
      title: shellStore.activeTab.title,
    };
  },
});

const {
  chatMessage,
  chatLoading,
  chatConversationId,
  chatTimeline,
  conversationList,
  conversationListLoading,
  recentGoalList,
  recentKnowledgeNoteList,
  referenceGoalList,
  referenceTaskList,
  referenceKnowledgeNoteList,
  recentKnowledgeNotesEmailVerificationRequired,
  recentKnowledgeNotesErrorMessageKey,
  messagesViewport,
  lastRuntimeUsage,
  composerAttachments,
  composerContextEntities,
  addComposerFiles,
  removeComposerAttachment,
  toggleExplicitContextEntity,
  removeContextEntity,
  selectConversation: selectConversationBase,
  openRecentGoal,
  openRecentKnowledgeNote,
  deleteConversation,
  loadConversationList,
  startNewConversation: startNewConversationBase,
  prepareWorkflowTurn,
  handleSendChat: handleSendChatBase,
  stopGenerating,
  decideToolApproval,
} = session;

const { selectedModelKey, modelGroups, canSendMessage, selectModel } = model;

const {
  goalClarification,
  goalWorkflowRun,
  goalOwnerSubmitted,
  goalAgentResuming,
  editableGoal,
  editableKeyResults,
  editableTasks,
  editableKnowledge,
  canRetryGoalAgentExecution,
  canAcceptGoalPartialExecution,
  canCancelRemainingGoalExecution,
  automatedGoalId,
  goalAgentWaitingForClarification,
  goalAgentWaitingForApproval,
  startGoalAgentRun,
  submitGoalClarificationResponse,
  submitGoalRevisionResponse,
  retryGoalAgentExecution,
  acceptPartialGoalExecution,
  cancelRemainingGoalExecution,
  openGoalNativeReview,
} = goalWorkflow;

const { knowledgeAnswer, askKnowledgeFromConversation, openKnowledgeCitation } =
  knowledgeQaWorkflow;

const {
  taskWorkflowRun,
  taskAgentResuming,
  taskOwnerAttemptPending,
  taskOwnerSubmitted,
  taskAgentWaitingForClarification,
  canRetryTaskAgentExecution,
  canAcceptTaskPartialExecution,
  canCancelRemainingTaskExecution,
  submitTaskClarificationResponse,
  openTaskNativeReview,
  setLinkedGoalId,
  startTaskAgentRun,
  cancelTaskAgentRun,
  confirmTaskAgentRun,
  retryTaskAgentExecution,
  acceptPartialTaskExecution,
  cancelRemainingTaskExecution,
} = taskWorkflow;

const {
  knowledgeCaptureRun,
  knowledgeCaptureResuming,
  knowledgeCaptureWaitingForClarification,
  canRetryKnowledgeCaptureExecution,
  canCancelRemainingKnowledgeCaptureExecution,
  submitKnowledgeClarificationResponse,
  startKnowledgeCaptureRun,
  cancelKnowledgeCaptureRun,
  retryKnowledgeCaptureExecution,
  cancelRemainingKnowledgeCaptureExecution,
  openKnowledgeNativeReview,
} = knowledgeCaptureWorkflow;

const { formatExecutionOutcome } = formatters;
const { toolMode, currentConversationLabel, currentToolLabel, exitToolMode, openSettings } = common;

const contextPanelOpen = ref(false);
const mobileSidebarOpen = ref(false);
const lastOpenedGoalId = ref<string | null>(null);

const hasWorkflowArtifact = computed(() => {
  if (toolMode.value === 'goal-create') return Boolean(goalWorkflowRun.value);
  if (toolMode.value === 'task-create') return Boolean(taskWorkflowRun.value);
  if (toolMode.value === 'knowledge-capture') return Boolean(knowledgeCaptureRun.value);
  if (toolMode.value === 'knowledge-qa') return Boolean(knowledgeAnswer.value);
  return false;
});
const hasWorkflowContext = computed(() => toolMode.value !== 'chat' || hasWorkflowArtifact.value);

function requestContextPanel(intent: 'automatic' | 'explicit') {
  contextPanelOpen.value = true;
  void intent;
}

watch(
  [hasWorkflowContext, toolMode],
  ([available, mode], [wasAvailable]) => {
    // Goal creation is owner-first: keep the native Goal surface primary and
    // expose the retained workflow context only when the user asks for it.
    if (available && !wasAvailable && mode !== 'goal-create') requestContextPanel('automatic');
  },
  { immediate: true },
);

watch(
  () => route.query.workflow,
  (workflow) => {
    if (workflow !== 'goal-create') return;
    startNewConversation('goal-create');
    requestContextPanel('explicit');
    const query = { ...route.query };
    delete query.workflow;
    void router.replace({ path: route.path, query });
  },
  { immediate: true },
);

watch([goalWorkflowRun, automatedGoalId, toolMode], () => {
  if (
    toolMode.value !== 'goal-create' ||
    goalWorkflowRun.value?.status !== 'completed' ||
    !automatedGoalId.value ||
    lastOpenedGoalId.value === automatedGoalId.value
  ) {
    return;
  }
  lastOpenedGoalId.value = automatedGoalId.value;
  try {
    shellStore?.openTab({
      module: 'goal',
      route: `/goals/${automatedGoalId.value}`,
      title: t('nav.capsule.goal'),
      intent: 'deeplink',
    });
  } catch {
    // Isolated component tests may not have a Pinia shell.
  }
  void router.push(`/goals/${automatedGoalId.value}`);
});

function handleWelcomeShortcut(mode: WorkflowMode) {
  const prefillKey = {
    chat: 'aiAssistant.chatPage.shortcuts.chat.prefill',
    'goal-create': 'aiAssistant.chatPage.shortcuts.goalCreate.prefill',
    'task-create': 'aiAssistant.chatPage.shortcuts.taskCreate.prefill',
    'knowledge-capture': 'aiAssistant.chatPage.shortcuts.knowledgeGenerate.prefill',
    'knowledge-qa': 'aiAssistant.chatPage.shortcuts.knowledgeQa.prefill',
  }[mode];
  startNewConversation('chat');
  if (prefillKey) chatMessage.value = t(prefillKey);
}

const workflowInProgress = computed(() => {
  const active =
    toolMode.value === 'goal-create'
      ? goalWorkflowRun.value
      : toolMode.value === 'task-create'
        ? taskWorkflowRun.value
        : toolMode.value === 'knowledge-capture'
          ? knowledgeCaptureRun.value
          : null;
  return Boolean(active && !['completed', 'failed', 'cancelled'].includes(active.status));
});

async function handleComposerSend() {
  const inferredMode = workflowInProgress.value
    ? toolMode.value
    : inferWorkflowMode(chatMessage.value);

  if (!workflowInProgress.value && inferredMode !== toolMode.value) {
    if (toolMode.value !== 'chat') exitToolMode();
    toolMode.value = inferredMode;
  }

  if (goalAgentWaitingForClarification.value) {
    const prepared = await prepareWorkflowTurn();
    if (!prepared) return;
    const resumed = await submitGoalClarificationResponse(prepared.content);
    if (!resumed) toolMode.value = 'chat';
    return;
  }

  if (goalAgentWaitingForApproval.value) {
    const prepared = await prepareWorkflowTurn();
    if (!prepared) return;
    const resumed = await submitGoalRevisionResponse(prepared.content);
    if (!resumed) toolMode.value = 'chat';
    return;
  }

  if (taskAgentWaitingForClarification.value) {
    const prepared = await prepareWorkflowTurn();
    if (!prepared) return;
    const resumed = await submitTaskClarificationResponse(prepared.content);
    if (!resumed) toolMode.value = 'chat';
    return;
  }

  if (knowledgeCaptureWaitingForClarification.value) {
    const prepared = await prepareWorkflowTurn();
    if (!prepared) return;
    const resumed = await submitKnowledgeClarificationResponse(prepared.content);
    if (!resumed) toolMode.value = 'chat';
    return;
  }

  if (inferredMode === 'task-create') {
    const selectedGoal = composerContextEntities.value.find(
      (entity) => entity.entityType === 'goal',
    );
    setLinkedGoalId(selectedGoal?.id ?? null);
  }

  if (!workflowInProgress.value && inferredMode === 'goal-create') {
    const workflowTurn = await prepareWorkflowTurn();
    if (!workflowTurn) return;
    const started = await startGoalAgentRun(workflowTurn.content);
    if (started === false) toolMode.value = 'chat';
    return;
  }

  await handleSendChatBase();

  if (inferredMode === 'goal-create') await startGoalAgentRun();
  if (inferredMode === 'task-create') {
    const started = await startTaskAgentRun();
    if (!started) toolMode.value = 'chat';
  } else if (inferredMode === 'knowledge-capture') {
    const started = await startKnowledgeCaptureRun();
    if (!started) toolMode.value = 'chat';
  } else if (inferredMode === 'knowledge-qa') await askKnowledgeFromConversation();
}

function toggleContextPanel() {
  contextPanelOpen.value = !contextPanelOpen.value;
}

function closeContextPanel() {
  contextPanelOpen.value = false;
}
function openMobileSidebar() {
  mobileSidebarOpen.value = true;
}
function closeMobileSidebar() {
  mobileSidebarOpen.value = false;
}

function startNewConversation(mode: WorkflowMode | string = 'chat') {
  lastOpenedGoalId.value = null;
  startNewConversationBase(mode);
}
function startNewConversationFromMobile() {
  closeMobileSidebar();
  startNewConversation();
}
async function selectConversation(item: ConversationSummary) {
  await selectConversationBase(item);
  if (hasWorkflowContext.value && toolMode.value !== 'goal-create') requestContextPanel('explicit');
}
async function selectConversationFromMobile(item: ConversationSummary) {
  closeMobileSidebar();
  await selectConversation(item);
}
async function openRecentGoalFromMobile(goalId: string) {
  closeMobileSidebar();
  await openRecentGoal(goalId);
}
async function openRecentKnowledgeNoteFromMobile(resourceId: string) {
  closeMobileSidebar();
  await openRecentKnowledgeNote(resourceId);
}
function openSettingsFromMobile() {
  closeMobileSidebar();
  openSettings();
}
function openAISettings() {
  void router.push('/settings?tab=ai');
}
function openGoalWithoutAI() {
  void router.push('/goals?dialog=goal');
}
function openQuickTaskWithoutAI() {
  void router.push('/tasks?dialog=quick-task');
}
onMounted(() => {
  const viewport = messagePanelRef.value?.viewport;
  if (viewport) messagesViewport.value = viewport;
});

defineExpose({
  conversationList,
  conversationListLoading,
  chatConversationId,
  selectConversation,
  deleteConversation,
  startNewConversation,
  loadConversationList,
});
</script>
