<script setup lang="ts">
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card } from '@memoflow/ui-vue-shadcn';
import { useTaskToday } from '../../composables/useTaskToday';
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

const task = useTaskToday();
const { t } = useI18n();

watch(
  [() => props.active, task.resolveIdentityScope],
  ([active]) => {
    if (active) void task.load();
  },
  { immediate: true },
);
</script>
<template>
  <Card
    class="flex flex-col rounded-xl border-transparent bg-[hsl(var(--surface-raised)/0.56)] p-3.5 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.72),inset_0_1px_0_hsl(var(--foreground)/0.02)]"
    data-testid="daily-todo-widget"
  >
    <TaskQuickSurface
      :title="t('task.management.surface.today')"
      :occurrences="task.instances.value"
      :templates="task.templates.value"
      :operations="task.operations"
      :loading="task.isLoading.value"
      :error="task.error?.value ? task.error.value : null"
      @retry="task.load(true)"
      @view-all="emit('view-all')"
      @open-plan="emit('open-plan', $event)"
      @completed="emit('completed', $event)"
    />
  </Card>
</template>
