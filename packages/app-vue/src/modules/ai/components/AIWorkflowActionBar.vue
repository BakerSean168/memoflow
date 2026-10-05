<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import { AlertTriangle } from '@lucide/vue';
import type { KnowledgeAnswer, WorkflowMode } from '../composables';

defineProps<{
  toolMode: WorkflowMode;
  workflowStatusText: string;
  automatedGoalId: string | null;
  createdSupportingTasks: readonly { id: string; title: string }[];
  createdSupportingKnowledge: readonly { id: string; title: string }[];
  goalAgentResuming: boolean;
  goalOwnerSubmitted: boolean;
  goalOwnerAttemptPending: boolean;
  canContinueGoalAgentExecution: boolean;
  canRetryGoalAgentExecution: boolean;
  canAcceptGoalPartialExecution: boolean;
  canCancelRemainingGoalExecution: boolean;
  goalAgentWaitingForClarification: boolean;
  goalAgentWaitingForApproval: boolean;
  goalAgentWaitingForExecution: boolean;
  knowledgeAnswer: KnowledgeAnswer | null;
  linkedGoalId: string | null;
  taskAgentResuming: boolean;
  taskOwnerAttemptPending: boolean;
  taskOwnerSubmitted: boolean;
  taskAgentWaitingForClarification: boolean;
  taskAgentWaitingForApproval: boolean;
  canRetryTaskAgentExecution: boolean;
  canAcceptTaskPartialExecution: boolean;
  canCancelRemainingTaskExecution: boolean;
  knowledgeCaptureResuming: boolean;
  knowledgeCaptureWaitingForClarification: boolean;
  knowledgeCaptureWaitingForApproval: boolean;
  canRetryKnowledgeCaptureExecution: boolean;
  canCancelRemainingKnowledgeCaptureExecution: boolean;
  confirmGoalAgentRun: () => void;
  cancelGoalAgentRun: () => void;
  continueGoalAgentExecution: () => void;
  retryGoalAgentExecution: () => void;
  acceptPartialGoalExecution: () => void;
  cancelRemainingGoalExecution: () => void;
  openAutomatedGoal: () => void;
  openCreatedSupportingTask: (taskId: string) => void;
  openCreatedSupportingKnowledge: (documentId: string) => void;
  cancelTaskAgentRun: () => void;
  retryTaskAgentExecution: () => void;
  acceptPartialTaskExecution: () => void;
  cancelRemainingTaskExecution: () => void;
  cancelKnowledgeCaptureRun: () => void;
  retryKnowledgeCaptureExecution: () => void;
  cancelRemainingKnowledgeCaptureExecution: () => void;
  exitToolMode: () => void;
}>();

const { t } = useI18n();
</script>

<template>
  <div
    v-if="toolMode !== 'chat'"
    class="rounded-xl bg-muted/25 px-3.5 py-2.5"
    data-testid="ai-workflow-action-bar"
  >
    <p class="text-sm leading-6 text-muted-foreground">{{ workflowStatusText }}</p>

    <div
      v-if="toolMode === 'goal-create' || toolMode === 'task-create'"
      class="mt-2 flex flex-wrap items-center gap-2"
    >
      <template v-if="toolMode === 'goal-create'">
        <Button
          v-if="canRetryGoalAgentExecution"
          variant="outline"
          size="sm"
          :disabled="goalAgentResuming"
          data-testid="goal-agent-retry-execution"
          @click="retryGoalAgentExecution"
        >
          {{ goalAgentResuming ? t('aiAssistant.dialogs.agent.resuming') : t('common.retry') }}
        </Button>

        <template v-else-if="goalAgentWaitingForApproval">
          <Button
            v-if="goalOwnerSubmitted || goalOwnerAttemptPending"
            variant="outline"
            size="sm"
            :disabled="goalAgentResuming"
            data-testid="goal-agent-retry-approval"
            @click="confirmGoalAgentRun"
          >
            {{ goalAgentResuming ? t('aiAssistant.dialogs.agent.resuming') : t('common.retry') }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            :disabled="goalAgentResuming || goalOwnerSubmitted || goalOwnerAttemptPending"
            data-testid="goal-agent-cancel-run"
            @click="cancelGoalAgentRun"
          >
            {{ t('common.cancel') }}
          </Button>
        </template>

        <Button
          v-else-if="goalAgentWaitingForExecution && canContinueGoalAgentExecution"
          variant="outline"
          size="sm"
          data-testid="goal-agent-continue-execution"
          @click="continueGoalAgentExecution"
        >
          {{
            goalAgentResuming
              ? t('aiAssistant.dialogs.agent.resuming')
              : t('aiAssistant.dialogs.agent.continueExecution')
          }}
        </Button>
        <Button
          v-if="canAcceptGoalPartialExecution"
          variant="outline"
          size="sm"
          data-testid="goal-agent-accept-partial"
          @click="acceptPartialGoalExecution"
        >
          {{ t('aiAssistant.chatPage.workflow.keepCompletedChanges') }}
        </Button>
        <Button
          v-if="canCancelRemainingGoalExecution"
          variant="ghost"
          size="sm"
          data-testid="goal-agent-cancel-remaining"
          @click="cancelRemainingGoalExecution"
        >
          {{ t('aiAssistant.chatPage.workflow.cancelRemaining') }}
        </Button>

        <Button
          v-if="goalAgentWaitingForClarification"
          variant="ghost"
          size="sm"
          :disabled="goalAgentResuming || goalOwnerSubmitted || goalOwnerAttemptPending"
          data-testid="goal-agent-cancel-run"
          @click="cancelGoalAgentRun"
        >
          {{ t('common.cancel') }}
        </Button>

        <Button
          v-if="automatedGoalId"
          variant="outline"
          size="sm"
          data-testid="goal-workflow-open-created-goal"
          @click="openAutomatedGoal"
        >
          {{ t('aiAssistant.dialogs.automation.openCreatedGoal') }}
        </Button>
        <Button
          v-for="task in createdSupportingTasks"
          :key="`task:${task.id}`"
          variant="outline"
          size="sm"
          data-testid="goal-workflow-open-supporting-task"
          @click="openCreatedSupportingTask(task.id)"
        >
          {{ t('aiAssistant.chatPage.workflow.openSupportingTask', { title: task.title }) }}
        </Button>
        <Button
          v-for="note in createdSupportingKnowledge"
          :key="`knowledge:${note.id}`"
          variant="outline"
          size="sm"
          data-testid="goal-workflow-open-supporting-knowledge"
          @click="openCreatedSupportingKnowledge(note.id)"
        >
          {{ t('aiAssistant.chatPage.workflow.openSupportingKnowledge', { title: note.title }) }}
        </Button>
      </template>

      <template v-else-if="toolMode === 'task-create'">
        <Button
          v-if="canRetryTaskAgentExecution"
          variant="outline"
          size="sm"
          :disabled="taskAgentResuming"
          data-testid="task-agent-chat-retry-execution"
          @click="retryTaskAgentExecution"
        >
          {{ t('common.retry') }}
        </Button>
        <Button
          v-if="canAcceptTaskPartialExecution"
          variant="outline"
          size="sm"
          data-testid="task-agent-chat-accept-partial"
          @click="acceptPartialTaskExecution"
        >
          {{ t('aiAssistant.chatPage.workflow.keepCompletedChanges') }}
        </Button>
        <Button
          v-if="canCancelRemainingTaskExecution"
          variant="ghost"
          size="sm"
          data-testid="task-agent-chat-cancel-remaining"
          @click="cancelRemainingTaskExecution"
        >
          {{ t('aiAssistant.chatPage.workflow.cancelRemaining') }}
        </Button>
        <Button
          v-if="taskAgentWaitingForClarification || taskAgentWaitingForApproval"
          variant="ghost"
          size="sm"
          :disabled="taskAgentResuming || taskOwnerAttemptPending || taskOwnerSubmitted"
          data-testid="task-agent-chat-cancel-run"
          @click="cancelTaskAgentRun"
        >
          {{ t('common.cancel') }}
        </Button>
        <span
          v-if="linkedGoalId"
          class="inline-flex h-7 items-center rounded-md bg-muted/70 px-2 text-xs text-muted-foreground"
          data-testid="task-agent-linked-goal-context"
        >
          {{ t('aiAssistant.chatPage.workflow.linkedGoalFromContext') }}
        </span>
      </template>
    </div>

    <div
      v-if="toolMode === 'knowledge-capture'"
      class="mt-2 flex flex-wrap items-center gap-2"
      data-testid="knowledge-capture-chat-actions"
    >
      <Button
        v-if="canRetryKnowledgeCaptureExecution"
        variant="outline"
        size="sm"
        :disabled="knowledgeCaptureResuming"
        data-testid="knowledge-capture-chat-retry-execution"
        @click="retryKnowledgeCaptureExecution"
      >
        {{ t('common.retry') }}
      </Button>
      <Button
        v-if="canCancelRemainingKnowledgeCaptureExecution"
        variant="ghost"
        size="sm"
        data-testid="knowledge-capture-chat-cancel-remaining"
        @click="cancelRemainingKnowledgeCaptureExecution"
      >
        {{ t('aiAssistant.chatPage.workflow.cancelRemaining') }}
      </Button>
      <Button
        v-if="knowledgeCaptureWaitingForClarification || knowledgeCaptureWaitingForApproval"
        variant="ghost"
        size="sm"
        :disabled="knowledgeCaptureResuming"
        data-testid="knowledge-capture-chat-cancel-run"
        @click="cancelKnowledgeCaptureRun"
      >
        {{ t('common.cancel') }}
      </Button>
    </div>

    <p
      v-if="
        toolMode === 'knowledge-qa' &&
        knowledgeAnswer &&
        knowledgeAnswer.evidenceStatus !== 'grounded'
      "
      class="mt-2 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground"
      data-testid="knowledge-qa-ungrounded-hint"
    >
      <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      {{ t('aiAssistant.chatPage.workflow.ungroundedHint') }}
    </p>

    <div class="mt-1 flex justify-end">
      <Button variant="ghost" size="sm" class="h-7 text-xs" @click="exitToolMode">
        {{ t('aiAssistant.chatPage.workflow.exitTool') }}
      </Button>
    </div>
  </div>
</template>
