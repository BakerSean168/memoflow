<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import { AlertTriangle } from '@lucide/vue';
import type { GoalClarificationView, KnowledgeAnswer, WorkflowMode } from '../composables';

defineProps<{
  toolMode: WorkflowMode;
  workflowStatusText: string;
  goalClarification: GoalClarificationView | null;
  automatedGoalId: string | null;
  goalAgentResuming: boolean;
  goalOwnerSubmitted: boolean;
  goalOwnerAttemptPending: boolean;
  canResumeGoalAgentClarification: boolean;
  canContinueGoalAgentExecution: boolean;
  canRetryGoalAgentExecution: boolean;
  goalAgentWaitingForClarification: boolean;
  goalAgentWaitingForApproval: boolean;
  goalAgentWaitingForExecution: boolean;
  knowledgeAnswer: KnowledgeAnswer | null;
  linkedGoalId: string | null;
  submitGoalAgentClarification: () => void;
  confirmGoalAgentRun: () => void;
  cancelGoalAgentRun: () => void;
  continueGoalAgentExecution: () => void;
  retryGoalAgentExecution: () => void;
  openAutomatedGoal: () => void;
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
      v-if="toolMode === 'goal-create' || (toolMode === 'task-create' && linkedGoalId)"
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
          v-else-if="goalAgentWaitingForExecution"
          variant="outline"
          size="sm"
          :disabled="!canContinueGoalAgentExecution"
          data-testid="goal-agent-continue-execution"
          @click="continueGoalAgentExecution"
        >
          {{
            goalAgentResuming
              ? t('aiAssistant.dialogs.agent.resuming')
              : t('aiAssistant.dialogs.agent.continueExecution')
          }}
        </Button>

        <template v-if="goalAgentWaitingForClarification && goalClarification">
          <Button
            variant="outline"
            size="sm"
            :disabled="!canResumeGoalAgentClarification"
            data-testid="goal-workflow-submit-clarification"
            @click="submitGoalAgentClarification"
          >
            {{
              goalAgentResuming
                ? t('aiAssistant.dialogs.agent.resuming')
                : t('aiAssistant.chatPage.workflow.submitGoalClarification')
            }}
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
          v-if="automatedGoalId"
          variant="outline"
          size="sm"
          data-testid="goal-workflow-open-created-goal"
          @click="openAutomatedGoal"
        >
          {{ t('aiAssistant.dialogs.automation.openCreatedGoal') }}
        </Button>
      </template>

      <span
        v-else-if="linkedGoalId"
        class="inline-flex h-7 items-center rounded-md bg-muted/70 px-2 text-xs text-muted-foreground"
        data-testid="task-agent-linked-goal-context"
      >
        {{ t('aiAssistant.chatPage.workflow.linkedGoalFromContext') }}
      </span>
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
