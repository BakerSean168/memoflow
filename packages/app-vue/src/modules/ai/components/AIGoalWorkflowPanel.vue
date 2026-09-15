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
          <textarea
            :value="clarificationAnswers[index]"
            rows="2"
            class="mt-3 block w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm leading-6 shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0"
            :placeholder="t('aiAssistant.chatPage.workflow.goalClarificationAnswerPlaceholder')"
            :data-testid="`goal-clarification-answer-${index}`"
            @input="updateClarificationAnswer(index, ($event.target as HTMLTextAreaElement).value)"
          />
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

      <template v-if="goalReviewDraft && showGoalDraftEditor">
        <AIGoalDraftEditor
          data-testid="goal-workflow-draft-editor"
          :goal="editableGoal"
          :key-results="editableKeyResults"
          :is-submitting="false"
          :show-confirm-action="false"
          @add-key-result="$emit('add-key-result')"
          @remove-key-result="(index) => $emit('remove-key-result', index)"
          @update-goal="(payload) => $emit('update-goal', payload)"
          @update-key-result="(payload) => $emit('update-key-result', payload)"
        />

        <div
          class="space-y-5 rounded-2xl border border-border/60 bg-muted/20 p-4"
          data-testid="goal-workflow-supporting-drafts-editor"
        >
          <div class="space-y-3">
            <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {{ t('aiAssistant.goalDraft.tasks') }}
            </p>
            <div v-if="editableTasks.length" class="space-y-3">
              <div
                v-for="(item, index) in editableTasks"
                :key="item.draftRef"
                class="space-y-3 rounded-xl border border-border/50 bg-background/70 p-3"
                data-testid="goal-workflow-task-editor"
              >
                <div class="flex items-center justify-between gap-3">
                  <span class="text-[10px] font-mono text-muted-foreground">{{
                    item.draftRef
                  }}</span>
                  <Button variant="outline" size="sm" @click="$emit('remove-task', index)">
                    {{ t('aiAssistant.goalDraft.removeTask') }}
                  </Button>
                </div>
                <Input
                  :model-value="item.title"
                  :placeholder="t('aiAssistant.goalDraft.taskName')"
                  @update:model-value="updateTask(index, { title: String($event ?? '') })"
                />
                <Textarea
                  class="min-h-20"
                  :model-value="item.description ?? ''"
                  :placeholder="t('aiAssistant.goalDraft.taskDescription')"
                  @update:model-value="
                    updateTask(index, { description: String($event ?? '') || null })
                  "
                />
                <div class="grid gap-3 @sm/ai:grid-cols-2">
                  <div class="grid gap-2">
                    <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {{ t('aiAssistant.goalDraft.importance') }}
                    </p>
                    <Select
                      :model-value="item.importance"
                      @update:model-value="
                        updateTask(index, {
                          importance: $event as EditableGoalTask['importance'],
                        })
                      "
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="option in importanceOptions"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div class="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                    <p class="text-[10px] uppercase tracking-[0.16em]">
                      {{ t('aiAssistant.goalDraft.schedule') }}
                    </p>
                    <p class="mt-1 text-foreground">{{ formatTaskSchedule(item) }}</p>
                  </div>
                </div>
                <p class="text-xs text-muted-foreground">
                  {{ item.goalRef }}<span v-if="item.keyResultRef"> → {{ item.keyResultRef }}</span>
                </p>
              </div>
            </div>
            <p v-else class="text-sm leading-6 text-muted-foreground">
              {{ t('aiAssistant.goalDraft.noTasks') }}
            </p>
          </div>

          <div class="space-y-3">
            <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {{ t('aiAssistant.goalDraft.knowledge') }}
            </p>
            <div v-if="editableKnowledge.length" class="space-y-3">
              <div
                v-for="(item, index) in editableKnowledge"
                :key="item.draftRef"
                class="space-y-3 rounded-xl border border-border/50 bg-background/70 p-3"
                data-testid="goal-workflow-knowledge-editor"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-[10px] font-mono text-muted-foreground">{{
                      item.draftRef
                    }}</span>
                    <span
                      class="rounded-full border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {{ item.mode }}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" @click="$emit('remove-knowledge', index)">
                    Remove
                  </Button>
                </div>

                <template v-if="item.mode === 'create'">
                  <Input
                    :model-value="item.title"
                    @update:model-value="
                      updateKnowledgeCreate(index, { title: String($event ?? '') })
                    "
                  />
                  <Input
                    :model-value="item.targetSubpath"
                    @update:model-value="
                      updateKnowledgeCreate(index, { targetSubpath: String($event ?? '') })
                    "
                  />
                  <Textarea
                    class="min-h-32"
                    :model-value="item.markdown"
                    @update:model-value="
                      updateKnowledgeCreate(index, { markdown: String($event ?? '') })
                    "
                  />
                  <div
                    v-if="item.sourceRefs.length"
                    class="space-y-1 text-xs text-muted-foreground"
                  >
                    <p class="font-medium text-foreground">
                      {{ t('aiAssistant.goalDraft.sources') }}
                    </p>
                    <p v-for="source in item.sourceRefs" :key="source" class="break-all">
                      {{ source }}
                    </p>
                  </div>
                </template>
                <template v-else>
                  <p class="text-sm font-medium text-foreground">{{ item.title }}</p>
                  <p class="break-all font-mono text-xs text-muted-foreground">
                    {{ item.knowledgeDocument.knowledgeSpaceId }} /
                    {{ item.knowledgeDocument.documentId }}
                  </p>
                </template>
              </div>
            </div>
            <p v-else class="text-sm leading-6 text-muted-foreground">
              {{ t('aiAssistant.goalDraft.noKnowledge') }}
            </p>
          </div>
        </div>
      </template>

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
          <div
            v-if="goalWorkflowRun.result.referenceMap['goal']"
            class="rounded-2xl border bg-muted/20 p-4"
          >
            <p class="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Goal</p>
            <p class="mt-1 break-all text-sm font-medium text-foreground">
              {{ goalWorkflowRun.result.referenceMap['goal'] }}
            </p>
          </div>
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
            :key="note.resourceId"
            class="rounded-2xl border bg-muted/20 p-4"
          >
            <div class="flex h-full flex-col gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-foreground">
                  {{ note.title || note.resourcePath }}
                </p>
                <p class="mt-1 break-words text-xs text-muted-foreground">
                  {{ note.resourcePath }}
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
                @click="$emit('open-knowledge-citation', note.resourceId)"
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
            :key="`${citation.resourceId}-${citation.chunkIndex}`"
            class="rounded-2xl border bg-muted/20 p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <p class="text-sm font-medium text-foreground">
                  {{ citation.title || citation.resourcePath }}
                </p>
                <p class="mt-1 break-words text-xs text-muted-foreground">
                  {{ citation.resourcePath }}
                </p>
              </div>
              <Button
                variant="outline"
                class="sm:shrink-0"
                data-testid="knowledge-citation-open"
                @click="$emit('open-knowledge-citation', citation.resourceId)"
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
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@memoflow/ui-vue-shadcn';
import AIGoalDraftEditor from './AIGoalDraftEditor.vue';
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
  clarificationAnswers: string[];
  editableGoal: EditableGoal;
  editableKeyResults: EditableKeyResult[];
  editableTasks: EditableGoalTask[];
  editableKnowledge: EditableGoalKnowledge[];
  showGoalDraftEditor: boolean;
  knowledgeAnswer: KnowledgeAnswer | null;
  formatExecutionOutcome: (status: 'success' | 'partial' | 'failed') => string;
}>();

const emit = defineEmits<{
  'update:clarificationAnswers': [answers: string[]];
  confirm: [];
  'add-key-result': [];
  'remove-key-result': [index: number];
  'update-goal': [payload: EditableGoal];
  'update-key-result': [payload: { index: number; value: EditableKeyResult }];
  'remove-task': [index: number];
  'update-task': [payload: { index: number; value: EditableGoalTask }];
  'remove-knowledge': [index: number];
  'update-knowledge': [payload: { index: number; value: EditableGoalKnowledge }];
  'open-knowledge-citation': [resourceId: string];
}>();

const { t } = useI18n();
const publicFailureMessage = (failure: AIWorkflowExecutionFailure) =>
  getAIWorkflowFailureMessage(failure, t);
type KnowledgeRelatedNote = NonNullable<KnowledgeAnswer['relatedNotes']>[number];

const importanceOptions = computed(() => [
  { value: 'Vital', label: t('aiAssistant.goalDraft.importanceLevels.vital') },
  { value: 'Important', label: t('aiAssistant.goalDraft.importanceLevels.important') },
  { value: 'Moderate', label: t('aiAssistant.goalDraft.importanceLevels.moderate') },
  { value: 'Minor', label: t('aiAssistant.goalDraft.importanceLevels.minor') },
  { value: 'Trivial', label: t('aiAssistant.goalDraft.importanceLevels.trivial') },
]);

const goalReviewDraft = computed(() => {
  const suspension = props.goalWorkflowRun?.suspension;
  return suspension?.type === 'goal_draft_review' ? suspension.draft : null;
});

const goalRecovery = computed(() => {
  const suspension = props.goalWorkflowRun?.suspension;
  return suspension?.type === 'recovery_required' ? suspension : null;
});

function updateClarificationAnswer(index: number, value: string) {
  const next = [...props.clarificationAnswers];
  next[index] = value;
  emit('update:clarificationAnswers', next);
}

function updateTask(index: number, patch: Partial<EditableGoalTask>) {
  const current = props.editableTasks[index];
  if (!current) return;
  emit('update-task', { index, value: { ...current, ...patch } });
}

function updateKnowledgeCreate(
  index: number,
  patch: Partial<Extract<EditableGoalKnowledge, { mode: 'create' }>>,
) {
  const current = props.editableKnowledge[index];
  if (!current || current.mode !== 'create') return;
  emit('update-knowledge', { index, value: { ...current, ...patch } });
}

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
  const notesByResourceId = new Map<string, KnowledgeRelatedNote>();
  for (const citation of answer.citations) {
    if (notesByResourceId.has(citation.resourceId)) continue;
    notesByResourceId.set(citation.resourceId, {
      resourceId: citation.resourceId,
      resourcePath: citation.resourcePath,
      title: citation.title,
      excerpt: citation.excerpt,
      score: citation.score,
    });
  }
  return [...notesByResourceId.values()];
}
</script>
