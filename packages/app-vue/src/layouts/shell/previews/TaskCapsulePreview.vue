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
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import { useTask } from '../../../modules/task/composables/useTask';
import TaskQuickSurface from '../../../modules/task/components/TaskQuickSurface.vue';
import { endOfDayMs, isTodayMs, startOfDayMs } from '../../../shared/utils/product-time';

const TEMPLATE_FETCH_LIMIT = 200;

const emit = defineEmits<{
  'view-all': [];
  select: [id: string];
}>();

const { t } = useI18n();
const task = useTask();

const localError = ref<string | null>(null);
const isLoading = ref(false);
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

onMounted(() => {
  void load();
});
</script>

<template>
  <TaskQuickSurface
    data-testid="task-capsule-preview"
    data-capsule-workspace="task"
    :title="t('nav.capsule.task')"
    :subtitle="t('shell.taskWorkspace.today')"
    :occurrences="todayInstances"
    :templates="task.templates.value"
    :operations="task"
    :loading="isLoading"
    :error="localError"
    quick-create
    @retry="load(true)"
    @created="load(true)"
    @open-plan="emit('select', $event)"
    @view-all="emit('view-all')"
  />
</template>
