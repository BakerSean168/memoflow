<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowRight, CheckCircle2, Plus, RotateCcw } from '@lucide/vue';
import { Button, Input } from '@memoflow/ui-vue-shadcn';
import {
  CapsulePreviewFooter,
  CapsulePreviewHeader,
  CapsulePreviewShell,
  CapsulePreviewState,
} from '../../../shared/components';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import {
  useTaskOccurrenceActionCoordinator,
  type TaskOccurrenceOperations,
} from '../composables/useTaskOccurrenceActionCoordinator';
import { useTaskPlanMutations } from '../composables/useTaskPlanMutations';
import { buildQuickTaskRequest } from '../utils/quick-task-request';
import TaskCompletionMeasurementDialog from './dialogs/TaskCompletionMeasurementDialog.vue';
import TaskOccurrenceCompactList from './TaskOccurrenceCompactList.vue';

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    occurrences: TaskOccurrenceClientDTO[];
    templates: TaskPlanClientDTO[];
    operations?: TaskOccurrenceOperations;
    loading?: boolean;
    error?: string | null;
    quickCreate?: boolean;
    viewAll?: boolean;
    summary?: boolean;
  }>(),
  { subtitle: '', loading: false, error: null, quickCreate: false, viewAll: true, summary: true },
);
const emit = defineEmits<{
  'open-plan': [id: string];
  'view-all': [];
  retry: [];
  created: [];
  completed: [occurrence: TaskOccurrenceClientDTO];
}>();
const { t } = useI18n();
const actionCoordinator = useTaskOccurrenceActionCoordinator({
  operations: props.operations,
  resolveGoalBinding: (id) => {
    const occurrence = props.occurrences.find((item) => String(item.id) === id);
    return props.templates.find((plan) => plan.id === occurrence?.planId)?.goalBinding;
  },
});
const {
  busyOccurrenceId,
  requestComplete,
  requestUncomplete,
  requestMissed,
  requestSkip,
  requestChecklistChange,
} = actionCoordinator;
const { createPlanSafe, isSaving: isCreatingQuickTask } = useTaskPlanMutations();
const quickTaskOpen = ref(false);
const quickTaskTitle = ref('');
const completedCount = computed(
  () => props.occurrences.filter((item) => item.status === 'Completed').length,
);
const progressPct = computed(() =>
  props.occurrences.length
    ? Math.round((completedCount.value / props.occurrences.length) * 100)
    : 0,
);
const visibleRows = computed(() => {
  const templates = new Map(props.templates.map((plan) => [String(plan.id), plan]));
  const terminal = (item: TaskOccurrenceClientDTO) =>
    ['Completed', 'Missed', 'Skipped'].includes(item.status);
  return [...props.occurrences]
    .sort((a, b) => Number(terminal(a)) - Number(terminal(b)) || a.dueAt - b.dueAt)
    .flatMap((occurrence) => {
      const template = templates.get(String(occurrence.planId));
      return template ? [{ occurrence, template }] : [];
    });
});
async function completeOccurrence(id: string) {
  const result = await requestComplete(id);
  if (result) emit('completed', result);
}
async function createQuickTask() {
  const title = quickTaskTitle.value.trim();
  if (!title || isCreatingQuickTask.value) return;
  if (!(await createPlanSafe(buildQuickTaskRequest(title), 'quick'))) return;
  quickTaskTitle.value = '';
  quickTaskOpen.value = false;
  emit('created');
}
</script>

<template>
  <CapsulePreviewShell max-height="32rem" data-testid="task-quick-preview">
    <CapsulePreviewHeader :title="title" :subtitle="subtitle">
      <template #actions>
        <span
          v-if="summary"
          class="rounded-full bg-muted/70 px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
          data-testid="task-quick-count"
        >
          {{ completedCount }}/{{ occurrences.length }}
        </span>
      </template>

      <div
        v-if="summary && occurrences.length"
        class="mt-2 h-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          class="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
          :style="{ width: `${progressPct}%` }"
          data-testid="task-quick-progress"
          :data-progress="progressPct"
        />
      </div>
    </CapsulePreviewHeader>

    <CapsulePreviewState
      v-if="loading && occurrences.length === 0"
      kind="loading"
      data-testid="task-quick-loading"
    >
      <div v-for="index in 4" :key="index" class="h-10 animate-pulse rounded-lg bg-muted/70" />
    </CapsulePreviewState>

    <CapsulePreviewState v-else-if="error" kind="error" data-testid="task-quick-error">
      <p class="max-w-64 text-[11px] leading-4 text-muted-foreground">{{ error }}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 text-[11px]"
        @click="emit('retry')"
      >
        <RotateCcw class="mr-1.5 h-3.5 w-3.5" />
        {{ t('common.retry') }}
      </Button>
    </CapsulePreviewState>

    <CapsulePreviewState
      v-else-if="occurrences.length === 0"
      kind="empty"
      data-testid="task-quick-empty"
    >
      <CheckCircle2 class="h-6 w-6 text-muted-foreground/45" />
      <p class="text-[11px] text-muted-foreground">{{ t('task.quickSurface.empty') }}</p>
    </CapsulePreviewState>

    <div v-else class="min-h-0 flex-1 overflow-y-auto py-1.5 pr-0.5" data-testid="task-quick-list">
      <TaskOccurrenceCompactList
        :rows="visibleRows"
        :busy-occurrence-id="busyOccurrenceId"
        @open-plan="emit('open-plan', $event)"
        @complete="completeOccurrence"
        @uncomplete="requestUncomplete"
        @missed="requestMissed"
        @skip="requestSkip"
        @checklist-change="requestChecklistChange"
      />
    </div>

    <CapsulePreviewFooter v-if="quickCreate || viewAll" align="between">
      <form
        v-if="quickCreate && quickTaskOpen"
        class="flex w-full items-center gap-1.5"
        data-testid="task-quick-quick-create"
        @submit.prevent="createQuickTask"
      >
        <Input
          v-model="quickTaskTitle"
          class="h-8 flex-1 text-xs"
          :placeholder="t('task.quickTask.placeholder')"
          :disabled="isCreatingQuickTask"
          maxlength="200"
          autofocus
          @keydown.escape.prevent="
            quickTaskOpen = false;
            quickTaskTitle = '';
          "
        />
        <Button
          type="submit"
          size="sm"
          class="h-8 px-2.5 text-xs"
          :disabled="!quickTaskTitle.trim() || isCreatingQuickTask"
          :loading="isCreatingQuickTask"
        >
          {{ t('common.add') }}
        </Button>
      </form>

      <div v-else class="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          class="flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          v-if="quickCreate"
          data-testid="task-quick-quick-task"
          @click="quickTaskOpen = true"
        >
          <Plus class="h-3.5 w-3.5" />
          {{ t('task.quickTask.title') }}
        </button>

        <button
          type="button"
          class="flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          v-if="viewAll"
          data-testid="task-quick-view-all"
          @click="emit('view-all')"
        >
          {{ t('task.quickSurface.viewAll') }}
          <ArrowRight class="h-3.5 w-3.5" />
        </button>
      </div>
    </CapsulePreviewFooter>
    <TaskCompletionMeasurementDialog
      :coordinator="actionCoordinator"
      @completed="emit('completed', $event)"
    />
  </CapsulePreviewShell>
</template>
