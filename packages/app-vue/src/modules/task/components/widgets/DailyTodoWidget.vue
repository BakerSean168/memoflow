<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { startOfDayMs, endOfDayMs, isTodayMs } from '../../../../shared/utils/product-time';
import { Card } from '@memoflow/ui-vue-shadcn';
import { useTask } from '../../composables/useTask';
import TaskQuickSurface from '../TaskQuickSurface.vue';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
const emit = defineEmits<{
  'view-all': [];
  'open-plan': [id: string];
  completed: [instance: TaskOccurrenceClientDTO];
}>();
const props = withDefaults(
  defineProps<{
    /** Home keeps this widget mounted while other shell surfaces are active. */
    active?: boolean;
  }>(),
  { active: true },
);

const task = useTask();
const { t } = useI18n();

const TEMPLATE_FETCH_LIMIT = 200;

function getTodayRange(): { startDate: number; endDate: number } {
  const now = new Date();
  return {
    startDate: startOfDayMs(now.getTime()),
    endDate: endOfDayMs(now.getTime()),
  };
}

async function loadToday(force = false) {
  const todayRange = getTodayRange();
  await Promise.all([
    task.fetchInstancesByDateRange(todayRange.startDate, todayRange.endDate, { force }),
    task.fetchTemplates({ page: 1, limit: TEMPLATE_FETCH_LIMIT }),
  ]);
}

// Home keeps this widget mounted while other shell surfaces are active. Refresh
// when the surface becomes active again so task creation in another tab is visible.
onMounted(() => {
  if (props.active) void loadToday();
});
watch(
  () => props.active,
  (active, wasActive) => {
    if (active && !wasActive) void loadToday();
  },
);

const todayInstances = computed(() =>
  (task.instances.value ?? []).filter((inst) => isTodayMs(inst.dueAt)),
);
</script>
<template>
  <Card
    class="flex flex-col rounded-xl border-transparent bg-[hsl(var(--surface-raised)/0.56)] p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.72),inset_0_1px_0_hsl(var(--foreground)/0.02)]"
    data-testid="daily-todo-widget"
  >
    <TaskQuickSurface
      :title="t('task.management.surface.today')"
      :occurrences="todayInstances"
      :templates="task.templates.value"
      :operations="task"
      :loading="task.isLoading.value"
      :error="task.error?.value ? String(task.error.value) : null"
      @retry="loadToday(true)"
      @view-all="emit('view-all')"
      @open-plan="emit('open-plan', $event)"
      @completed="emit('completed', $event)"
    />
  </Card>
</template>
