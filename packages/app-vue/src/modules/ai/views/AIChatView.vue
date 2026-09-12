<template>
  <div
    class="flex min-h-0 overflow-hidden bg-background"
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
      <header v-show="!composerOnly" class="border-b bg-background px-4 py-3 @md/ai:px-6">
        <div class="flex items-center justify-between gap-3">
          <h1 class="truncate text-lg font-medium text-foreground">
            {{ currentConversationLabel }}
          </h1>
          <div class="flex items-center gap-2">
            <AIRuntimeUsageBadge :usage="lastRuntimeUsage" />
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
                    ? t('aiAssistant.chatPage.context.hide')
                    : t('aiAssistant.chatPage.context.show')
                "
                class="h-8 w-8"
                :title="
                  contextPanelOpen
                    ? t('aiAssistant.chatPage.context.hide')
                    : t('aiAssistant.chatPage.context.show')
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
        :show-workflow-surface="hasWorkflowContext"
        @select-tool="startNewConversation"
        @select-shortcut="handleWelcomeShortcut"
        @configure-ai="openAISettings"
        @create-goal="openGoalWithoutAI"
        @quick-task="openQuickTaskWithoutAI"
      >
        <template #workflow-surface>
          <p
            v-if="workflowStatusText"
            class="rounded-2xl border bg-muted/20 px-4 py-3 text-sm leading-6 text-muted-foreground"
            data-testid="ai-workflow-status-inline"
          >
            {{ workflowStatusText }}
          </p>
        </template>
      </AIMessagePanel>

      <div v-show="!composerOnly" class="px-4 @md/ai:px-6">
        <div class="mx-auto w-full max-w-4xl">
          <AIWorkflowActionBar
            :tool-mode="toolMode"
            :workflow-status-text="workflowStatusText"
            :goal-clarification="goalClarification"
            :automated-goal-id="automatedGoalId"
            :goal-agent-loading="goalAgentLoading"
            :goal-agent-resuming="goalAgentResuming"
            :show-goal-draft-editor="showGoalDraftEditor"
            :can-run-goal-agent="canRunGoalAgent"
            :can-resume-goal-agent-clarification="canResumeGoalAgentClarification"
            :can-continue-goal-agent-execution="canContinueGoalAgentExecution"
            :can-retry-goal-agent-execution="canRetryGoalAgentExecution"
            :goal-agent-waiting-for-clarification="goalAgentWaitingForClarification"
            :goal-agent-waiting-for-approval="goalAgentWaitingForApproval"
            :goal-agent-waiting-for-execution="goalAgentWaitingForExecution"
            :knowledge-answer="knowledgeAnswer"
            :knowledge-query-loading="knowledgeQueryLoading"
            :can-ask-knowledge="canAskKnowledge"
            :task-agent-loading="taskAgentLoading"
            :can-run-task-agent="canRunTaskAgent"
            :linked-goal-id="linkedGoalId"
            :recent-goals="recentGoalList"
            :knowledge-capture-loading="knowledgeCaptureLoading"
            :can-run-knowledge-capture="canRunKnowledgeCapture"
            :start-goal-agent-run="startGoalAgentRun"
            :start-task-agent-run="startTaskAgentRun"
            :set-linked-goal-id="setLinkedGoalId"
            :start-knowledge-capture-run="startKnowledgeCaptureRun"
            :submit-goal-agent-clarification="submitGoalAgentClarification"
            :confirm-goal-agent-run="confirmGoalAgentRun"
            :cancel-goal-agent-run="cancelGoalAgentRun"
            :continue-goal-agent-execution="continueGoalAgentExecution"
            :retry-goal-agent-execution="retryGoalAgentExecution"
            :toggle-goal-draft-editor="toggleGoalDraftEditor"
            :open-automated-goal="openAutomatedGoal"
            :ask-knowledge-from-conversation="askKnowledgeFromConversation"
            :exit-tool-mode="exitToolMode"
          />
        </div>
      </div>

      <Teleport v-if="shellComposerMount" :to="shellComposerMount">
        <AIFooterComposer
          ref="composerRef"
          v-model="chatMessage"
          :loading="chatLoading"
          :can-send="canSendMessage"
          :tool-button-label="currentToolButtonLabel"
          :model-groups="modelGroups"
          :selected-model-key="selectedModelKey"
          :density="composerDensity"
          @send="handleSendChat"
          @stop="stopGenerating"
          @start-conversation="startNewConversation"
          @select-model="selectModel"
          @open-settings="openAISettings"
        />
      </Teleport>
      <AIFooterComposer
        v-else
        ref="composerRef"
        v-model="chatMessage"
        :loading="chatLoading"
        :can-send="canSendMessage"
        :tool-button-label="currentToolButtonLabel"
        :model-groups="modelGroups"
        :selected-model-key="selectedModelKey"
        :density="composerDensity"
        @send="handleSendChat"
        @stop="stopGenerating"
        @start-conversation="startNewConversation"
        @select-model="selectModel"
        @open-settings="openAISettings"
      />
    </section>

    <Teleport :to="shellWorkflowMount ?? 'body'" :disabled="!shellWorkflowMount">
      <AIContextPanel
        v-show="!composerOnly"
        :has-workflow-context="hasWorkflowContext"
        :open="contextPanelOpen"
        :embedded="Boolean(shellWorkflowMount)"
        :tool-label="currentToolLabel"
        @close="closeContextPanel"
      >
        <AIGoalWorkflowPanel
          :tool-mode="toolMode"
          :goal-clarification="goalClarification"
          :goal-workflow-run="goalWorkflowRun"
          :clarification-answers="clarificationAnswers"
          :editable-goal="editableGoal"
          :editable-key-results="editableKeyResults"
          :editable-tasks="editableTasks"
          :editable-knowledge="editableKnowledge"
          :show-goal-draft-editor="showGoalDraftEditor"
          :knowledge-answer="knowledgeAnswer"
          :format-execution-outcome="formatExecutionOutcome"
          @update:clarification-answers="handleClarificationAnswersUpdate"
          @confirm="handleCreateGoalFromDraft"
          @add-key-result="addKeyResultDraft"
          @remove-key-result="removeKeyResultDraft"
          @update-goal="handleUpdateGoalDraft"
          @update-key-result="updateKeyResultDraft"
          @remove-task="removeTaskDraft"
          @update-task="updateTaskDraft"
          @remove-knowledge="removeKnowledgeDraft"
          @update-knowledge="updateKnowledgeDraft"
          @open-knowledge-citation="openKnowledgeCitation"
        />
        <AITaskWorkflowPanel
          :tool-mode="toolMode"
          :task-workflow-run="taskWorkflowRun"
          @confirm="confirmTaskAgentRun"
          @cancel="cancelTaskAgentRun"
          @retry="retryTaskAgentExecution"
          @edit-started="showTaskDraftEditor = true"
        />
        <AIKnowledgeCapturePanel
          :tool-mode="toolMode"
          :knowledge-capture-run="knowledgeCaptureRun"
          @confirm="confirmKnowledgeCaptureRun"
          @cancel="cancelKnowledgeCaptureRun"
          @retry="retryKnowledgeCaptureExecution"
          @edit-started="showKnowledgeDraftEditor = true"
        />
        <div
          v-if="!hasWorkflowArtifact"
          class="rounded-lg border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground"
          data-testid="ai-context-empty-state"
        >
          {{ t('aiAssistant.chatPage.context.empty') }}
        </div>
      </AIContextPanel>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
import AIWorkflowActionBar from '../components/AIWorkflowActionBar.vue';
import AIContextPanel from '../components/AIContextPanel.vue';
import AIRuntimeUsageBadge from '../components/AIRuntimeUsageBadge.vue';
import { useAppShellStore } from '../../../layouts/shell/useAppShellStore';
import {
  SHELL_COMPOSER_DENSITY_KEY,
  SHELL_COMPOSER_MOUNT_KEY,
  SHELL_WORKFLOW_MOUNT_KEY,
} from '../../../di/keys';
import type { ComposerDensity } from '../../../layouts/shell/panel-geometry';
import { useAIChatView } from '../composables/useAIChatView';
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
const shellWorkflowMountRef = inject(SHELL_WORKFLOW_MOUNT_KEY, null);
const shellComposerMount = computed(() => shellComposerMountRef?.value ?? null);
const shellWorkflowMount = computed(() => shellWorkflowMountRef?.value ?? null);
const shellStore = shellWorkflowMountRef ? useAppShellStore() : null;
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
} = useAIChatView({ getComposerTextarea: () => composerRef.value?.composerTextarea ?? null });

const {
  chatMessage,
  chatLoading,
  chatConversationId,
  chatTimeline,
  conversationList,
  conversationListLoading,
  recentGoalList,
  recentKnowledgeNoteList,
  recentKnowledgeNotesEmailVerificationRequired,
  recentKnowledgeNotesErrorMessageKey,
  messagesViewport,
  lastRuntimeUsage,
  selectConversation: selectConversationBase,
  openRecentGoal,
  openRecentKnowledgeNote,
  deleteConversation,
  loadConversationList,
  startNewConversation: startNewConversationBase,
  handleSendChat,
  stopGenerating,
} = session;

const { selectedModelKey, modelGroups, canSendMessage, selectModel } = model;

const {
  goalClarification,
  goalWorkflowRun,
  clarificationAnswers,
  showGoalDraftEditor,
  goalAgentLoading,
  goalAgentResuming,
  editableGoal,
  editableKeyResults,
  editableTasks,
  editableKnowledge,
  canRunGoalAgent,
  canResumeGoalAgentClarification,
  canContinueGoalAgentExecution,
  canRetryGoalAgentExecution,
  automatedGoalId,
  goalAgentWaitingForClarification,
  goalAgentWaitingForApproval,
  goalAgentWaitingForExecution,
  startGoalAgentRun,
  submitGoalAgentClarification,
  confirmGoalAgentRun,
  cancelGoalAgentRun,
  continueGoalAgentExecution,
  retryGoalAgentExecution,
  openAutomatedGoal,
  handleCreateGoalFromDraft,
  addKeyResultDraft,
  removeKeyResultDraft,
  updateKeyResultDraft,
  handleUpdateGoalDraft,
  removeTaskDraft,
  updateTaskDraft,
  removeKnowledgeDraft,
  updateKnowledgeDraft,
  toggleGoalDraftEditor,
} = goalWorkflow;

const {
  knowledgeQueryLoading,
  knowledgeAnswer,
  canAskKnowledge,
  askKnowledgeFromConversation,
  openKnowledgeCitation,
} = knowledgeQaWorkflow;

const {
  taskAgentLoading,
  taskWorkflowRun,
  showTaskDraftEditor,
  canRunTaskAgent,
  linkedGoalId,
  setLinkedGoalId,
  startTaskAgentRun,
  cancelTaskAgentRun,
  confirmTaskAgentRun,
  retryTaskAgentExecution,
} = taskWorkflow;

const {
  knowledgeCaptureRun,
  showKnowledgeDraftEditor,
  canRunKnowledgeCapture,
  knowledgeCaptureLoading,
  startKnowledgeCaptureRun,
  cancelKnowledgeCaptureRun,
  confirmKnowledgeCaptureRun,
  retryKnowledgeCaptureExecution,
} = knowledgeCaptureWorkflow;

const { formatExecutionOutcome } = formatters;
const {
  toolMode,
  currentConversationLabel,
  currentToolLabel,
  currentToolButtonLabel,
  workflowStatusText,
  exitToolMode,
  openSettings,
} = common;

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
const workflowSurfaceItemCount = computed(() => (hasWorkflowArtifact.value ? 1 : 0));

function requestContextPanel(intent: 'automatic' | 'explicit') {
  contextPanelOpen.value = true;
  shellStore?.requestWorkflowSurface(intent);
}

watch(
  [hasWorkflowContext, workflowSurfaceItemCount],
  ([available, itemCount], [wasAvailable]) => {
    shellStore?.setWorkflowAvailable(available, itemCount);
    if (available && !wasAvailable) requestContextPanel('automatic');
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
  startNewConversation(mode);
  if (prefillKey) chatMessage.value = t(prefillKey);
}

function toggleContextPanel() {
  if (shellStore) {
    if (shellStore.panelSurface === 'workflow' && shellStore.rightPanelOpen) {
      shellStore.closeWorkflowSurface();
    } else requestContextPanel('explicit');
    return;
  }
  contextPanelOpen.value = !contextPanelOpen.value;
}

function closeContextPanel() {
  if (shellStore) shellStore.closeWorkflowSurface();
  else contextPanelOpen.value = false;
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
  if (hasWorkflowContext.value) requestContextPanel('explicit');
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
function handleClarificationAnswersUpdate(answers: string[]) {
  clarificationAnswers.value = answers;
}

onMounted(() => {
  const viewport = messagePanelRef.value?.viewport;
  if (viewport) messagesViewport.value = viewport;
});
onBeforeUnmount(() => shellStore?.setWorkflowAvailable(false));

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
