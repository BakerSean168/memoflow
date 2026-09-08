<template>
  <section
    v-if="toolMode === 'task-create' && taskWorkflowRun"
    class="space-y-4 rounded-3xl border bg-card p-5"
    data-testid="task-workflow-panel"
  >
    <div class="space-y-2">
      <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {{ t('aiAssistant.chatPage.workflow.taskAwaitingApprovalHint') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <span class="rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground">{{
          taskWorkflowRun.status
        }}</span>
        <AIRuntimeUsageBadge :usage="taskWorkflowRun.usage" />
        <span
          v-if="reviewDraft"
          class="rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground"
          data-testid="task-workflow-revision"
          >rev {{ reviewDraft.revision }}</span
        >
      </div>
      <h2 v-if="reviewDraft" class="text-lg font-semibold text-foreground">
        {{ reviewDraft.task.title }}
      </h2>
      <p v-if="reviewDraft" class="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
        {{ reviewDraft.rationale }}
      </p>
    </div>
    <div v-if="reviewDraft?.warnings.length" class="space-y-2">
      <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {{ t('aiAssistant.dialogs.agent.warnings') }}
      </p>
      <div
        v-for="warning in reviewDraft.warnings"
        :key="warning"
        class="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground"
      >
        {{ warning }}
      </div>
    </div>
    <div
      v-if="taskWorkflowRun.suspension?.type === 'recovery_required'"
      class="space-y-2"
      data-testid="task-workflow-recovery"
    >
      <p class="text-sm text-muted-foreground">
        {{
          taskWorkflowRun.suspension.retryable
            ? t('aiAssistant.dialogs.automation.recoveryRetryReady')
            : t('aiAssistant.errors.workflowExecutionFailed')
        }}
      </p>
      <p
        v-for="(failure, index) in taskWorkflowRun.suspension.failures"
        :key="`${failure.operation}-${failure.index ?? 'root'}-${failure.code}-${index}`"
        class="text-sm text-destructive"
      >
        {{ failure.operation }} · {{ publicFailureMessage(failure) }}
      </p>
      <Button
        v-if="taskWorkflowRun.suspension.retryable"
        variant="outline"
        data-testid="task-agent-retry-execution"
        @click="$emit('retry')"
        >{{ t('aiAssistant.dialogs.agent.retry') }}</Button
      >
    </div>
    <div
      v-if="taskWorkflowRun.status === 'completed' && taskWorkflowRun.result"
      class="space-y-2"
      data-testid="task-workflow-result"
    >
      <p class="text-sm text-muted-foreground">{{ taskWorkflowRun.result.status }}</p>
      <p class="text-sm text-muted-foreground">
        {{ taskWorkflowRun.result.taskPlanId || '—' }} ·
        {{ taskWorkflowRun.result.taskIds.length }} tasks
      </p>
    </div>
    <div v-if="taskWorkflowRun.status === 'suspended' && reviewDraft" class="flex gap-2">
      <Button data-testid="task-agent-confirm-run" @click="$emit('confirm')">{{
        t('aiAssistant.dialogs.automation.confirm')
      }}</Button>
      <Button variant="outline" data-testid="task-agent-cancel-run" @click="$emit('cancel')">{{
        t('common.cancel')
      }}</Button>
      <Button variant="ghost" @click="$emit('edit-started')">{{ t('common.edit') }}</Button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '@memoflow/ui-vue-shadcn';
import { useI18n } from 'vue-i18n';
import type { AIWorkflowExecutionFailure, AIWorkflowRunView } from '@memoflow/contracts/ai';
import type { WorkflowMode } from '../composables/types';
import AIRuntimeUsageBadge from './AIRuntimeUsageBadge.vue';
import { getAIWorkflowFailureMessage } from '../composables/error';

const { t } = useI18n();
const publicFailureMessage = (failure: AIWorkflowExecutionFailure) =>
  getAIWorkflowFailureMessage(failure, t);
const props = defineProps<{
  toolMode: WorkflowMode;
  taskWorkflowRun: Extract<AIWorkflowRunView, { kind: 'task.create' }> | null;
}>();
defineEmits<{
  confirm: [];
  cancel: [];
  retry: [];
  'edit-started': [];
  'update-clarification-answer': [index: number, value: string];
}>();
const reviewDraft = computed(() =>
  props.taskWorkflowRun?.suspension?.type === 'task_draft_review'
    ? props.taskWorkflowRun.suspension.draft
    : null,
);
</script>
