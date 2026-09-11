<template>
  <section
    v-if="toolMode === 'knowledge-capture' && knowledgeCaptureRun"
    class="space-y-4 rounded-3xl border bg-card p-5"
    data-testid="knowledge-capture-workflow-panel"
  >
    <div class="space-y-2">
      <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {{ t('aiAssistant.chatPage.workflow.knowledgeCaptureAwaitingApprovalHint') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <span class="rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground">{{
          knowledgeCaptureRun.status
        }}</span>
        <AIRuntimeUsageBadge :usage="knowledgeCaptureRun.usage" />
        <span
          v-if="reviewDraft"
          class="rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground"
          data-testid="knowledge-capture-workflow-revision"
        >
          rev {{ reviewDraft.revision }}
        </span>
      </div>
      <h2 v-if="reviewDraft" class="text-lg font-semibold text-foreground">
        {{ reviewDraft.title }}
      </h2>
      <p v-if="reviewDraft" class="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
        {{ reviewDraft.topic }}
      </p>
      <p
        v-if="reviewDraft"
        class="font-mono text-xs text-muted-foreground"
        data-testid="knowledge-capture-workflow-document-id"
      >
        memoflow_id: {{ reviewDraft.knowledgeDocumentId }}
      </p>
    </div>

    <div v-if="reviewDraft?.tags.length" class="flex flex-wrap gap-2">
      <span
        v-for="tag in reviewDraft.tags"
        :key="tag"
        class="rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground"
      >
        {{ tag }}
      </span>
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
        :key="`${failure.operation}-${failure.index ?? 'root'}-${failure.code}-${index}`"
        class="text-sm text-destructive"
      >
        {{ failure.operation }} · {{ publicFailureMessage(failure) }}
      </p>
      <Button
        v-if="knowledgeCaptureRun.suspension.retryable"
        variant="outline"
        data-testid="knowledge-capture-agent-retry-execution"
        @click="$emit('retry')"
      >
        {{ t('aiAssistant.dialogs.agent.retry') }}
      </Button>
    </div>

    <div
      v-if="knowledgeCaptureRun.status === 'completed' && knowledgeCaptureRun.result"
      class="space-y-2"
      data-testid="knowledge-capture-workflow-result"
    >
      <p class="text-sm text-muted-foreground">{{ knowledgeCaptureRun.result.status }}</p>
      <p class="text-sm text-muted-foreground">
        {{ knowledgeCaptureRun.result.noteName || '—' }} ·
        {{ knowledgeCaptureRun.result.notePath || '—' }}
      </p>
    </div>

    <div v-if="knowledgeCaptureRun.status === 'suspended' && reviewDraft" class="flex gap-2">
      <Button data-testid="knowledge-capture-agent-confirm-run" @click="$emit('confirm')">
        {{ t('aiAssistant.dialogs.automation.confirm') }}
      </Button>
      <Button
        variant="outline"
        data-testid="knowledge-capture-agent-cancel-run"
        @click="$emit('cancel')"
      >
        {{ t('common.cancel') }}
      </Button>
      <Button variant="ghost" @click="$emit('edit-started')">
        {{ t('common.edit') }}
      </Button>
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
  knowledgeCaptureRun: Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }> | null;
}>();

defineEmits<{
  confirm: [];
  cancel: [];
  retry: [];
  'edit-started': [];
  'update-clarification-answer': [index: number, value: string];
}>();

const reviewDraft = computed(() =>
  props.knowledgeCaptureRun?.suspension?.type === 'knowledge_draft_review'
    ? props.knowledgeCaptureRun.suspension.draft
    : null,
);
</script>
