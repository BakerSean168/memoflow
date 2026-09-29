<script setup lang="ts">
/**
 * Task capsule quick workspace.
 *
 * This surface is intentionally execution-oriented: today's occurrences can be
 * completed, skipped, and have their occurrence-owned checklist updated without
 * entering the full Task module. Planning/configuration remains Task-owned.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowRight, CheckCircle2, Plus, RotateCcw } from '@lucide/vue';
import { Button, Input } from '@memoflow/ui-vue-shadcn';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import { useTask } from '../../../modules/task/composables/useTask';
import { useTaskPlanMutations } from '../../../modules/task/composables/useTaskPlanMutations';
import { buildQuickTaskRequest } from '../../../modules/task/utils/quick-task-request';
import TaskOccurrenceCompactRow from '../../../modules/task/components/TaskOccurrenceCompactRow.vue';
import {
  endOfDayMs,
  isTodayMs,
  startOfDayMs,
} from '../../../shared/utils/product-time';

const TEMPLATE_FETCH_LIMIT = 200;

const emit = defineEmits<{
  'view-all': [];
  select: [id: string];
}>();

const { t } = useI18n();
const task = useTask();
const { createPlanSafe, isSaving: isCreatingQuickTask } = useTaskPlanMutations();

const localError = ref<string | null>(null);
const isLoading = ref(false);
const busyOccurrenceId = ref<string | null>(null);
const quickTaskOpen = ref(false);
const quickTaskTitle = ref('');

function getTodayRange() {
  const now = Date.now();
  return {
    startDate: startOfDayMs(now),
    endDate: endOfDayMs(now),
  };
}

const todayInstances = computed<TaskOccurrenceClientDTO[]>(() =>
  (task.instances.value ?? []).filter((inst) => isTodayMs(inst.dueAt)),
);

const completedCount = computed(
  () => todayInstances.value.filter((inst) => inst.status === 'Completed').length,
);

const progressPct = computed(() => {
  if (todayInstances.value.length === 0) return 0;
  return Math.round((completedCount.value / todayInstances.value.length) * 100);
});

const templateMap = computed(() => {
  const map = new Map<string, TaskPlanClientDTO>();
  for (const template of task.templates.value ?? []) {
    map.set(String(template.id), template);
  }
  return map;
});

const visibleOccurrences = computed(() => {
  const active = todayInstances.value
    .filter(
      (inst) =>
        inst.status !== 'Completed' && inst.status !== 'Skipped' && inst.status !== 'Missed',
    )
    .sort((a, b) => a.dueAt - b.dueAt);
  const terminal = todayInstances.value
    .filter(
      (inst) =>
        inst.status === 'Completed' || inst.status === 'Skipped' || inst.status === 'Missed',
    )
    .sort((a, b) => a.dueAt - b.dueAt);
  return [...active, ...terminal];
});

const visibleRows = computed(() =>
  visibleOccurrences.value.flatMap((occurrence) => {
    const template = templateMap.value.get(String(occurrence.planId));
    return template ? [{ occurrence, template }] : [];
  }),
);

async function load(force = false): Promise<void> {
  isLoading.value = true;
  localError.value = null;
  try {
    const range = getTodayRange();
    await Promise.all([
      task.fetchInstancesByDateRange(range.startDate, range.endDate, { force }),
      task.fetchTemplates({ page: 1, limit: TEMPLATE_FETCH_LIMIT }),
    ]);
    if (task.error?.value) localError.value = String(task.error.value);
  } catch (error) {
    localError.value = error instanceof Error ? error.message : t('common.operationFailed');
  } finally {
    isLoading.value = false;
  }
}

async function runOccurrenceAction(
  occurrenceId: string,
  action: (id: string) => Promise<unknown>,
): Promise<void> {
  if (busyOccurrenceId.value) return;
  busyOccurrenceId.value = occurrenceId;
  try {
    await action(occurrenceId);
  } finally {
    busyOccurrenceId.value = null;
  }
}

function completeOccurrence(id: string): Promise<void> {
  return runOccurrenceAction(id, task.completeOccurrence);
}

function uncompleteOccurrence(id: string): Promise<void> {
  return runOccurrenceAction(id, task.uncompleteOccurrence);
}

function skipOccurrence(id: string): Promise<void> {
  return runOccurrenceAction(id, task.skipOccurrence);
}

function setOccurrenceChecklistItem(
  occurrenceId: string,
  definitionId: string,
  completed: boolean,
  expectedVersion: number,
): Promise<void> {
  return runOccurrenceAction(occurrenceId, (id) =>
    task.setOccurrenceChecklistItem(id, {
      definitionId,
      completed,
      expectedVersion,
    }),
  );
}

async function createQuickTask(): Promise<void> {
  const title = quickTaskTitle.value.trim();
  if (!title || isCreatingQuickTask.value) return;

  const saved = await createPlanSafe(buildQuickTaskRequest(title), 'quick');

  if (!saved) return;
  quickTaskTitle.value = '';
  quickTaskOpen.value = false;
  await load(true);
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div
    class="flex max-h-[32rem] min-h-0 flex-col"
    data-testid="task-capsule-preview"
    data-capsule-workspace="task"
  >
    <div class="shrink-0 border-b border-border/50 pb-2">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold text-foreground">{{ t('nav.capsule.task') }}</p>
          <p class="mt-0.5 text-[10px] text-muted-foreground">
            {{ t('shell.taskWorkspace.today') }}
          </p>
        </div>
        <span
          class="rounded-full bg-muted/70 px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
          data-testid="task-capsule-count"
        >
          {{ completedCount }}/{{ todayInstances.length }}
        </span>
      </div>

      <div v-if="todayInstances.length" class="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
          :style="{ width: `${progressPct}%` }"
          data-testid="task-capsule-progress"
        />
      </div>
    </div>

    <div
      v-if="isLoading && todayInstances.length === 0"
      class="space-y-1.5 py-3"
      data-testid="task-capsule-loading"
    >
      <div v-for="index in 4" :key="index" class="h-10 animate-pulse rounded-lg bg-muted/70" />
    </div>

    <div
      v-else-if="localError"
      class="flex flex-col items-center gap-2 py-5 text-center"
      data-testid="task-capsule-error"
    >
      <p class="max-w-64 text-[11px] leading-4 text-muted-foreground">{{ localError }}</p>
      <Button type="button" variant="ghost" size="sm" class="h-7 text-[11px]" @click="load(true)">
        <RotateCcw class="mr-1.5 h-3.5 w-3.5" />
        {{ t('common.retry') }}
      </Button>
    </div>

    <div
      v-else-if="todayInstances.length === 0"
      class="flex flex-col items-center justify-center py-7 text-center"
      data-testid="task-capsule-empty"
    >
      <CheckCircle2 class="mb-2 h-6 w-6 text-muted-foreground/45" />
      <p class="text-[11px] text-muted-foreground">{{ t('shell.preview.taskEmpty') }}</p>
    </div>

    <div
      v-else
      class="min-h-0 flex-1 overflow-y-auto py-1.5 pr-0.5"
      data-testid="task-capsule-list"
    >
      <TaskOccurrenceCompactRow
        v-for="row in visibleRows"
        :key="row.occurrence.id"
        :occurrence="row.occurrence"
        :template="row.template"
        :busy="busyOccurrenceId === String(row.occurrence.id)"
        @open-plan="emit('select', $event)"
        @complete="completeOccurrence"
        @uncomplete="uncompleteOccurrence"
        @skip="skipOccurrence"
        @checklist-change="setOccurrenceChecklistItem"
      />
    </div>

    <div class="shrink-0 border-t border-border/50 pt-2">
      <form
        v-if="quickTaskOpen"
        class="flex items-center gap-1.5"
        data-testid="task-capsule-quick-create"
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

      <div v-else class="flex items-center justify-between gap-2">
        <button
          type="button"
          class="flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          data-testid="task-capsule-quick-task"
          @click="quickTaskOpen = true"
        >
          <Plus class="h-3.5 w-3.5" />
          {{ t('shell.home.quickTask') }}
        </button>

        <button
          type="button"
          class="flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          data-testid="task-capsule-view-all"
          @click="emit('view-all')"
        >
          {{ t('shell.taskWorkspace.viewAll') }}
          <ArrowRight class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
