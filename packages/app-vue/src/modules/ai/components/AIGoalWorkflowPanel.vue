<template>
  <!-- Goal clarification -->
  <section
    v-if="toolMode === 'goal-create' && goalClarification"
    class="rounded-3xl border bg-card p-5"
    data-testid="goal-clarification-panel"
  >
    <div class="flex flex-col gap-4">
      <div class="space-y-2">
        <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {{ t('aiAssistant.chatPage.workflow.goalClarificationTitle') }}
        </p>
        <p class="text-sm leading-6 text-muted-foreground">
          {{
            goalClarification.rationale || t('aiAssistant.chatPage.workflow.goalClarificationHint')
          }}
        </p>
      </div>

      <div class="space-y-4">
        <div
          v-for="(item, index) in goalClarification.questions"
          :key="`${item.question}-${index}`"
          class="rounded-2xl border bg-muted/30 p-4"
        >
          <p class="text-sm font-medium text-foreground">{{ index + 1 }}. {{ item.question }}</p>
          <p v-if="item.context" class="mt-2 text-sm leading-6 text-muted-foreground">
            {{ item.context }}
          </p>
        </div>
      </div>
    </div>
  </section>

  <!-- Canonical durable goal.create Workflow -->
  <section
    v-if="toolMode === 'goal-create' && goalWorkflowRun"
    class="rounded-3xl border bg-card p-5"
    data-testid="goal-workflow-panel"
  >
    <div class="space-y-4">
      <div class="space-y-2">
        <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {{ t('aiAssistant.chatPage.workflow.goalDraftTitle') }}
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground">
            {{ goalWorkflowRun.status }}
          </span>
          <AIRuntimeUsageBadge :usage="goalWorkflowRun.usage" />
          <span
            v-if="goalReviewDraft"
            class="rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground"
            data-testid="goal-workflow-revision"
          >
            rev {{ goalReviewDraft.revision }}
          </span>
        </div>
        <h2 v-if="goalReviewDraft" class="text-lg font-semibold text-foreground">
          {{ editableGoal.name || t('common.untitled') }}
        </h2>
        <p
          v-if="goalReviewDraft"
          class="whitespace-pre-wrap text-sm leading-6 text-muted-foreground"
        >
          {{ goalReviewDraft.rationale }}
        </p>
      </div>

      <div v-if="goalReviewDraft && editableKeyResults.length" class="flex flex-wrap gap-2">
        <span
          v-for="(item, index) in editableKeyResults"
          :key="`${item.title}-${index}`"
          class="rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground"
        >
          {{ item.title || t('aiAssistant.goalDraft.keyResults') }}
        </span>
      </div>

      <div
        v-if="goalReviewDraft?.warnings.length"
        class="space-y-2"
        data-testid="goal-workflow-warnings"
      >
        <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {{ t('aiAssistant.dialogs.agent.warnings') }}
        </p>
        <div
          v-for="(warning, index) in goalReviewDraft.warnings"
          :key="`${warning}-${index}`"
          class="rounded-2xl border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground"
        >
          {{ warning }}
        </div>
      </div>

      <div
        v-if="goalResearchEvidence.length"
        class="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4"
        data-testid="goal-workflow-research-evidence"
      >
        <div class="space-y-1">
          <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {{ t('aiAssistant.chatPage.workflow.goalResearchTitle') }}
          </p>
          <p class="text-xs leading-5 text-muted-foreground">
            {{ t('aiAssistant.chatPage.workflow.goalResearchExternalHint') }}
          </p>
        </div>
        <div
          v-for="(evidence, evidenceIndex) in goalResearchEvidence"
          :key="evidence.intent + ':' + evidence.query + ':' + evidenceIndex"
          class="space-y-2 rounded-xl border border-border/50 bg-background/70 p-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="rounded-full border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {{ t('aiAssistant.chatPage.workflow.goalResearchIntent.' + evidence.intent) }}
            </span>
            <p class="text-xs text-muted-foreground">{{ evidence.query }}</p>
          </div>
          <p class="line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {{ evidence.summary }}
          </p>
          <div class="flex flex-wrap gap-x-3 gap-y-1">
            <a
              v-for="source in evidence.sources"
              :key="source.url"
              :href="source.url"
              target="_blank"
              rel="noopener noreferrer"
              class="max-w-full truncate text-xs text-primary underline-offset-4 hover:underline"
              data-testid="goal-research-source"
            >
              {{ source.title }}
            </a>
          </div>
        </div>
      </div>

      <div v-if="goalReviewDraft" class="space-y-2">
        <p data-testid="goal-native-review-hint" class="text-sm text-muted-foreground">
          {{
            t(
              goalOwnerSubmitted
                ? 'aiAssistant.chatPage.workflow.goalOwnerSubmittedHint'
                : 'aiAssistant.chatPage.workflow.goalNativeReviewHint',
            )
          }}
        </p>
        <Button
          v-if="!goalOwnerSubmitted"
          variant="outline"
          size="sm"
          data-testid="goal-open-native-review"
          @click="$emit('open-native-review')"
        >
          {{ t('aiAssistant.chatPage.workflow.openGoalNativeReview') }}
        </Button>
      </div>
      <div
        v-if="
          goalReviewDraft &&
          !goalOwnerSubmitted &&
          (editableTasks.length > 0 || editableKnowledge.length > 0)
        "
        class="space-y-5 rounded-2xl border border-border/60 bg-muted/20 p-4"
        data-testid="goal-workflow-supporting-proposals"
      >
        <div v-if="editableTasks.length" class="space-y-3">
          <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {{ t('aiAssistant.goalDraft.tasks') }}
          </p>
          <div
            v-for="item in editableTasks"
            :key="item.draftRef"
            class="space-y-2 rounded-xl border border-border/50 bg-background/70 p-3"
            data-testid="goal-workflow-task-proposal"
          >
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-sm font-medium text-foreground">{{ item.title }}</p>
              <span
                class="rounded-full border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {{ item.importance }}
              </span>
            </div>
            <p v-if="item.description" class="text-sm leading-6 text-muted-foreground">
              {{ item.description }}
            </p>
            <p class="text-xs text-muted-foreground">{{ formatTaskSchedule(item) }}</p>
          </div>
        </div>

        <div v-if="editableKnowledge.length" class="space-y-3">
          <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {{ t('aiAssistant.goalDraft.knowledge') }}
          </p>
          <div
            v-for="item in editableKnowledge"
            :key="item.draftRef"
            class="space-y-2 rounded-xl border border-border/50 bg-background/70 p-3"
            data-testid="goal-workflow-knowledge-proposal"
          >
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-sm font-medium text-foreground">{{ item.title }}</p>
              <span
                class="rounded-full border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {{ item.mode }}
              </span>
            </div>
            <template v-if="item.mode === 'create'">
              <p class="break-all text-xs text-muted-foreground">{{ item.targetSubpath }}</p>
              <p class="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {{ item.markdown }}
              </p>
              <p
                v-for="source in item.sourceRefs"
                :key="source"
                class="break-all text-xs text-muted-foreground"
              >
                {{ source }}
              </p>
            </template>
          </div>
        </div>
      </div>

      <div v-if="goalRecovery" class="space-y-3" data-testid="goal-workflow-recovery">
        <div class="flex items-center gap-2">
          <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {{ t('aiAssistant.dialogs.automation.recoveryTitle') }}
          </p>
          <span class="rounded-full border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {{ goalRecovery.retryable ? 'retryable' : 'blocked' }}
          </span>
        </div>
        <div
          v-for="(failure, index) in goalRecovery.failures"
          :key="`${failure.operation}-${failure.code}-${index}`"
          class="rounded-2xl border bg-muted/20 p-4"
        >
          <p class="text-sm font-medium text-foreground">
            {{ failure.operation }} · {{ failure.code }}
          </p>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">
            {{ publicFailureMessage(failure) }}
          </p>
        </div>
      </div>

      <div v-if="goalWorkflowRun.result" class="space-y-3" data-testid="goal-workflow-result">
        <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {{ t('aiAssistant.dialogs.automation.executionStatus') }}
        </p>
        <p class="text-sm font-medium text-foreground">
          {{ formatExecutionOutcome(goalWorkflowRun.result.status) }}
        </p>
        <div class="grid gap-2 @sm/ai:grid-cols-2">
          <div class="rounded-2xl border bg-muted/20 p-4">
            <p class="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Mutations</p>
            <p class="mt-1 text-sm font-medium text-foreground">
              {{ appliedMutationCount(goalWorkflowRun.result) }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Knowledge Q&A answer -->
  <section
    v-if="toolMode === 'knowledge-qa' && knowledgeAnswer"
    class="rounded-3xl border bg-card p-5"
    data-testid="knowledge-answer-panel"
  >
    <div class="space-y-4">
      <div class="space-y-2">
        <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {{ t('aiAssistant.dialogs.knowledge.answer') }}
        </p>
        <span
          class="inline-flex rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground"
        >
          {{
            knowledgeAnswer.evidenceStatus === 'grounded'
              ? t('aiAssistant.dialogs.knowledge.grounded')
              : t('aiAssistant.dialogs.knowledge.insufficientEvidence')
          }}
        </span>
      </div>

      <div class="rounded-2xl border bg-muted/30 p-4">
        <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {{ t('aiAssistant.dialogs.knowledge.question') }}
        </p>
        <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
          {{ knowledgeAnswer.question }}
        </p>
      </div>

      <div>
        <p class="whitespace-pre-wrap text-sm leading-6 text-foreground">
          {{ knowledgeAnswer.answer }}
        </p>
        <p class="mt-3 text-xs text-muted-foreground">
          {{
            t('aiAssistant.dialogs.knowledge.matchedResources', {
              count: knowledgeAnswer.matchedResourceCount,
              ms: knowledgeAnswer.processingTimeMs,
            })
          }}
        </p>
      </div>

      <div v-if="getKnowledgeRelatedNotes(knowledgeAnswer).length">
        <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {{ t('aiAssistant.dialogs.knowledge.relatedNotes') }}
        </p>
        <div class="mt-2 grid gap-2 @sm/ai:grid-cols-2">
          <div
            v-for="note in getKnowledgeRelatedNotes(knowledgeAnswer)"
            :key="`${note.documentRef.knowledgeSpaceId}:${note.documentRef.documentId}`"
            class="rounded-2xl border bg-muted/20 p-4"
          >
            <div class="flex h-full flex-col gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-foreground">
                  {{ note.title || note.sourcePath }}
                </p>
                <p class="mt-1 break-words text-xs text-muted-foreground">
                  {{ note.sourcePath }}
                </p>
                <p
                  v-if="note.excerpt"
                  class="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground"
                >
                  {{ note.excerpt }}
                </p>
              </div>
              <Button
                variant="outline"
                class="self-start"
                data-testid="knowledge-related-note-open"
                @click="$emit('open-knowledge-citation', note.documentRef)"
              >
                {{ t('aiAssistant.dialogs.knowledge.openCitation') }}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="knowledgeAnswer.citations.length">
        <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {{ t('aiAssistant.dialogs.knowledge.citations') }}
        </p>
        <div class="mt-2 space-y-2">
          <div
            v-for="citation in knowledgeAnswer.citations"
            :key="`${citation.documentRef.knowledgeSpaceId}:${citation.documentRef.documentId}-${citation.chunkIndex}`"
            class="rounded-2xl border bg-muted/20 p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <p class="text-sm font-medium text-foreground">
                  {{ citation.title || citation.sourcePath }}
                </p>
                <p class="mt-1 break-words text-xs text-muted-foreground">
                  {{ citation.sourcePath }}
                </p>
              </div>
              <Button
                variant="outline"
                class="sm:shrink-0"
                data-testid="knowledge-citation-open"
                @click="$emit('open-knowledge-citation', citation.documentRef)"
              >
                {{ t('aiAssistant.dialogs.knowledge.openCitation') }}
              </Button>
            </div>
            <p class="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {{ citation.excerpt }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { AIWorkflowExecutionFailure, AIWorkflowRunView } from '@memoflow/contracts/ai';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import AIRuntimeUsageBadge from './AIRuntimeUsageBadge.vue';
import { getAIWorkflowFailureMessage } from '../composables/error';
import type {
  EditableGoal,
  EditableGoalKnowledge,
  EditableGoalTask,
  EditableKeyResult,
  GoalClarificationView,
  KnowledgeAnswer,
  WorkflowMode,
} from '../composables';

const props = defineProps<{
  toolMode: WorkflowMode;
  goalClarification: GoalClarificationView | null;
  goalWorkflowRun: Extract<AIWorkflowRunView, { kind: 'goal.create' }> | null;
  editableGoal: EditableGoal;
  editableKeyResults: EditableKeyResult[];
  editableTasks: EditableGoalTask[];
  editableKnowledge: EditableGoalKnowledge[];
  goalOwnerSubmitted?: boolean;
  knowledgeAnswer: KnowledgeAnswer | null;
  formatExecutionOutcome: (status: 'success' | 'partial' | 'failed') => string;
}>();

defineEmits<{
  'open-native-review': [];
  'open-knowledge-citation': [documentRef: KnowledgeRelatedNote['documentRef']];
}>();

const { t } = useI18n();
const publicFailureMessage = (failure: AIWorkflowExecutionFailure) =>
  getAIWorkflowFailureMessage(failure, t);
type KnowledgeRelatedNote = NonNullable<KnowledgeAnswer['relatedNotes']>[number];

const goalReviewDraft = computed(() => {
  const suspension = props.goalWorkflowRun?.suspension;
  return suspension?.type === 'goal_draft_review' ? suspension.draft : null;
});

const goalResearchEvidence = computed(() => {
  const suspension = props.goalWorkflowRun?.suspension;
  if (suspension?.type !== 'goal_draft_review' && suspension?.type !== 'clarification_required') {
    return [];
  }
  return suspension.researchEvidence ?? [];
});

const goalRecovery = computed(() => {
  const suspension = props.goalWorkflowRun?.suspension;
  return suspension?.type === 'recovery_required' ? suspension : null;
});

function formatTaskSchedule(task: EditableGoalTask): string {
  const schedule = task.schedule;
  const timing =
    schedule.timing.kind === 'AllDay'
      ? t('aiAssistant.goalDraft.allDay')
      : schedule.timing.kind === 'At'
        ? schedule.timing.time
        : `${schedule.timing.start}–${schedule.timing.end}`;
  if (schedule.kind === 'OneTime') return `${schedule.date} · ${timing}`;
  const recurrence = schedule.recurrence;
  return `${schedule.startDate} · ${recurrence.frequency} ×${recurrence.interval} · ${timing}`;
}

function appliedMutationCount(
  receipt: NonNullable<Extract<AIWorkflowRunView, { kind: 'goal.create' }>['result']>,
): number {
  return Object.keys(receipt.referenceMap).length + Object.keys(receipt.relationIds).length;
}

function getKnowledgeRelatedNotes(answer: KnowledgeAnswer | null): KnowledgeRelatedNote[] {
  if (!answer) return [];
  if (answer.relatedNotes?.length) return answer.relatedNotes;
  const notesByDocumentRef = new Map<string, KnowledgeRelatedNote>();
  for (const citation of answer.citations) {
    const key = `${citation.documentRef.knowledgeSpaceId}\0${citation.documentRef.documentId}`;
    if (notesByDocumentRef.has(key)) continue;
    notesByDocumentRef.set(key, {
      documentRef: citation.documentRef,
      sourcePath: citation.sourcePath,
      title: citation.title,
      excerpt: citation.excerpt,
      score: citation.score,
    });
  }
  return [...notesByDocumentRef.values()];
}
</script>
