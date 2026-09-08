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
          class="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-4"
          data-testid="goal-workflow-supporting-drafts-editor"
        >
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {{ t('aiAssistant.goalDraft.taskPlans') }}
              </p>
              <Button variant="outline" size="sm" @click="$emit('add-task-plan')">
                {{ t('aiAssistant.goalDraft.addTaskPlan') }}
              </Button>
            </div>

            <div v-if="editableTaskPlans.length" class="space-y-3">
              <div
                v-for="(item, index) in editableTaskPlans"
                :key="`task-plan-${index}`"
                class="space-y-3 rounded-xl border border-border/50 bg-background/70 p-3"
                data-testid="goal-workflow-task-plan-editor"
              >
                <Input
                  :model-value="item.name"
                  :placeholder="t('aiAssistant.goalDraft.taskPlanName')"
                  @update:model-value="updateTaskPlan(index, { name: String($event ?? '') })"
                />
                <Textarea
                  class="min-h-20"
                  :model-value="item.description"
                  :placeholder="t('aiAssistant.goalDraft.taskPlanDescription')"
                  @update:model-value="
                    updateTaskPlan(index, { description: String($event ?? '') })
                  "
                />
                <div class="grid gap-3 @sm/ai:grid-cols-3">
                  <div class="grid gap-2">
                    <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {{ t('aiAssistant.goalDraft.cadence') }}
                    </p>
                    <Select
                      :model-value="item.cadence"
                      @update:model-value="
                        updateTaskPlan(index, {
                          cadence: $event as EditableGoalTaskPlan['cadence'],
                        })
                      "
                    >
                      <SelectTrigger>
                        <SelectValue :placeholder="t('aiAssistant.goalDraft.selectCadence')" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="option in cadenceOptions"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div class="grid gap-2">
                    <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {{ t('aiAssistant.goalDraft.reminderTime') }}
                    </p>
                    <Input
                      type="time"
                      :model-value="item.timeOfDay"
                      data-testid="goal-workflow-task-time"
                      @update:model-value="
                        updateTaskPlan(index, { timeOfDay: String($event ?? '') })
                      "
                    />
                  </div>

                  <div class="grid gap-2">
                    <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {{ t('aiAssistant.goalDraft.importance') }}
                    </p>
                    <Select
                      :model-value="item.importance"
                      @update:model-value="
                        updateTaskPlan(index, {
                          importance: $event as EditableGoalTaskPlan['importance'],
                        })
                      "
                    >
                      <SelectTrigger>
                        <SelectValue :placeholder="t('aiAssistant.goalDraft.selectImportance')" />
                      </SelectTrigger>
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
                </div>
                <Button variant="outline" @click="$emit('remove-task-plan', index)">
                  {{ t('aiAssistant.goalDraft.removeTaskPlan') }}
                </Button>
              </div>
            </div>
            <p v-else class="text-sm leading-6 text-muted-foreground">
              {{ t('aiAssistant.goalDraft.noTaskPlans') }}
            </p>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {{ t('aiAssistant.goalDraft.reminders') }}
              </p>
              <Button variant="outline" size="sm" @click="$emit('add-reminder')">
                {{ t('aiAssistant.goalDraft.addReminder') }}
              </Button>
            </div>

            <div v-if="editableReminders.length" class="space-y-3">
              <div
                v-for="(item, index) in editableReminders"
                :key="`reminder-${index}`"
                class="space-y-3 rounded-xl border border-border/50 bg-background/70 p-3"
                data-testid="goal-workflow-reminder-editor"
              >
                <Input
                  :model-value="item.title"
                  :placeholder="t('aiAssistant.goalDraft.reminderTitle')"
                  @update:model-value="updateReminder(index, { title: String($event ?? '') })"
                />
                <Textarea
                  class="min-h-20"
                  :model-value="item.description"
                  :placeholder="t('aiAssistant.goalDraft.reminderDescription')"
                  @update:model-value="updateReminder(index, { description: String($event ?? '') })"
                />
                <div class="grid gap-3 @sm/ai:grid-cols-3">
                  <div class="grid gap-2">
                    <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {{ t('aiAssistant.goalDraft.cadence') }}
                    </p>
                    <Select
                      :model-value="item.cadence"
                      @update:model-value="
                        updateReminder(index, {
                          cadence: $event as EditableGoalReminder['cadence'],
                        })
                      "
                    >
                      <SelectTrigger>
                        <SelectValue :placeholder="t('aiAssistant.goalDraft.selectCadence')" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="option in cadenceOptions"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div class="grid gap-2">
                    <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {{ t('aiAssistant.goalDraft.reminderTime') }}
                    </p>
                    <Input
                      type="time"
                      :model-value="item.timeOfDay"
                      data-testid="goal-workflow-reminder-time"
                      @update:model-value="
                        updateReminder(index, { timeOfDay: String($event ?? '') })
                      "
                    />
                  </div>

                  <div class="grid gap-2">
                    <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {{ t('aiAssistant.goalDraft.importance') }}
                    </p>
                    <Select
                      :model-value="item.importance"
                      @update:model-value="
                        updateReminder(index, {
                          importance: $event as EditableGoalReminder['importance'],
                        })
                      "
                    >
                      <SelectTrigger>
                        <SelectValue :placeholder="t('aiAssistant.goalDraft.selectImportance')" />
                      </SelectTrigger>
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
                </div>
                <Button variant="outline" @click="$emit('remove-reminder', index)">
                  {{ t('aiAssistant.goalDraft.removeReminder') }}
                </Button>
              </div>
            </div>
            <p v-else class="text-sm leading-6 text-muted-foreground">
              {{ t('aiAssistant.goalDraft.noReminders') }}
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
          :key="`${failure.operation}-${failure.index ?? 'root'}-${index}`"
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
          <div v-if="goalWorkflowRun.result.goalId" class="rounded-2xl border bg-muted/20 p-4">
            <p class="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Goal</p>
            <p class="mt-1 break-all text-sm font-medium text-foreground">
              {{ goalWorkflowRun.result.goalId }}
            </p>
          </div>
          <div class="rounded-2xl border bg-muted/20 p-4">
            <p class="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Mutations</p>
            <p class="mt-1 text-sm font-medium text-foreground">
              {{
                goalWorkflowRun.result.taskIds.length + goalWorkflowRun.result.reminderIds.length
              }}
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
  EditableKeyResult,
  EditableGoalReminder,
  EditableGoalTaskPlan,
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
  editableTaskPlans: EditableGoalTaskPlan[];
  editableReminders: EditableGoalReminder[];
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
  'add-task-plan': [];
  'remove-task-plan': [index: number];
  'update-task-plan': [payload: { index: number; value: EditableGoalTaskPlan }];
  'add-reminder': [];
  'remove-reminder': [index: number];
  'update-reminder': [payload: { index: number; value: EditableGoalReminder }];
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

const cadenceOptions = computed(() => [
  { value: 'daily', label: t('aiAssistant.goalDraft.cadenceDaily') },
  { value: 'weekly', label: t('aiAssistant.goalDraft.cadenceWeekly') },
  { value: 'once', label: t('aiAssistant.goalDraft.cadenceOnce') },
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

function updateTaskPlan(index: number, patch: Partial<EditableGoalTaskPlan>) {
  emit('update-task-plan', {
    index,
    value: { ...props.editableTaskPlans[index], ...patch },
  });
}

function updateReminder(index: number, patch: Partial<EditableGoalReminder>) {
  emit('update-reminder', {
    index,
    value: { ...props.editableReminders[index], ...patch },
  });
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
