<template>
  <section
    v-if="toolMode === 'knowledge-capture' && knowledgeCaptureRun"
    class="space-y-4 rounded-3xl border bg-card p-5"
    data-testid="knowledge-capture-workflow-panel"
  >
    <div class="space-y-2">
      <div class="flex flex-wrap gap-2">
        <span class="rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground">{{
          t('aiAssistant.chatPage.workflow.status.' + knowledgeCaptureRun.status)
        }}</span>
        <AIRuntimeUsageBadge :usage="knowledgeCaptureRun.usage" />
      </div>
    </div>

    <div
      v-if="knowledgeCaptureRun.suspension?.type === 'clarification_required'"
      class="space-y-3"
      data-testid="knowledge-capture-clarification"
    >
      <p
        v-for="(question, index) in knowledgeCaptureRun.suspension.questions"
        :key="index"
        class="text-sm leading-6 text-muted-foreground"
      >
        {{ index + 1 }}. {{ question }}
      </p>
      <Button :disabled="busy" variant="outline" @click="$emit('cancel')">{{
        t('common.cancel')
      }}</Button>
    </div>

    <div
      v-if="knowledgeCaptureRun.suspension?.type === 'recovery_required'"
      class="space-y-2"
      data-testid="knowledge-capture-workflow-recovery"
    >
      <p class="text-sm text-muted-foreground">
        {{
          knowledgeCaptureRun.suspension.retryable
            ? t('aiAssistant.dialogs.automation.recoveryRetryReady')
            : t('aiAssistant.errors.workflowExecutionFailed')
        }}
      </p>
      <p
        v-for="(failure, index) in knowledgeCaptureRun.suspension.failures"
        :key="`${failure.operation}-${failure.code}-${index}`"
        class="text-sm text-destructive"
        :title="failureDiagnostic(failure)"
      >
        {{ publicFailureMessage(failure) }}
      </p>
      <div class="flex flex-wrap gap-2">
        <Button
          v-if="canRetryExecution"
          variant="outline"
          :disabled="busy"
          data-testid="knowledge-capture-agent-retry-execution"
          @click="$emit('retry')"
        >
          {{ t('aiAssistant.dialogs.agent.retry') }}
        </Button>
        <Button
          v-if="canCancelRemainingExecution"
          variant="ghost"
          :disabled="busy"
          data-testid="knowledge-capture-agent-cancel-remaining"
          @click="$emit('cancel-remaining')"
        >
          {{ t('aiAssistant.chatPage.workflow.cancelRemaining') }}
        </Button>
      </div>
    </div>

    <div
      v-if="knowledgeCaptureRun.status === 'completed' && knowledgeCaptureRun.result"
      class="space-y-2"
      data-testid="knowledge-capture-workflow-result"
    >
      <p class="text-sm text-muted-foreground">
        {{ resultStatusLabel(knowledgeCaptureRun.result.status) }}
      </p>
      <p class="text-sm text-muted-foreground">
        {{ knowledgeCaptureRun.result.noteName || '—' }} ·
        {{ knowledgeCaptureRun.result.notePath || '—' }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Button } from '@memoflow/ui-vue-shadcn';
import { useI18n } from 'vue-i18n';
import type { AIWorkflowExecutionFailure, AIWorkflowRunView } from '@memoflow/ai-contracts';
import type { WorkflowMode } from '../composables/types';
import AIRuntimeUsageBadge from './AIRuntimeUsageBadge.vue';
import { getAIWorkflowFailureMessage } from '../composables/error';

const { t } = useI18n();
const publicFailureMessage = (failure: AIWorkflowExecutionFailure) =>
  getAIWorkflowFailureMessage(failure, t);
/** Raw operation/code stay diagnosable in the tooltip, never as the headline. */
const failureDiagnostic = (failure: AIWorkflowExecutionFailure) =>
  `${failure.operation} · ${failure.code}`;
function resultStatusLabel(status: 'success' | 'partial' | 'failed'): string {
  return t(`aiAssistant.chatPage.workflow.knowledgeCaptureResultStatus.${status}`);
}
defineProps<{
  toolMode: WorkflowMode;
  knowledgeCaptureRun: Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }> | null;
  busy?: boolean;
  canRetryExecution?: boolean;
  canCancelRemainingExecution?: boolean;
}>();

defineEmits<{
  cancel: [];
  retry: [];
  'cancel-remaining': [];
}>();
</script>
