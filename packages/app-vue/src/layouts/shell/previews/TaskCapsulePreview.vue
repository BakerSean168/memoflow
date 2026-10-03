<script setup lang="ts">
/**
 * Task capsule quick workspace.
 *
 * This surface is intentionally execution-oriented: today's occurrences can be
 * completed, skipped, and have their occurrence-owned checklist updated without
 * entering the full Task module. Planning/configuration remains Task-owned.
 */
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTaskToday } from '../../../modules/task/composables/useTaskToday';
import TaskQuickSurface from '../../../modules/task/components/TaskQuickSurface.vue';

const emit = defineEmits<{
  'view-all': [];
  select: [id: string];
}>();
const { t } = useI18n();
const task = useTaskToday();
watch(
  task.resolveIdentityScope,
  () => {
    void task.load();
  },
  { immediate: true },
);
</script>

<template>
  <TaskQuickSurface
    data-testid="task-capsule-preview"
    data-capsule-workspace="task"
    :title="t('nav.capsule.task')"
    :subtitle="t('shell.taskWorkspace.today')"
    :occurrences="task.instances.value"
    :templates="task.templates.value"
    :operations="task.operations"
    :loading="task.isLoading.value"
    :error="task.error.value ? task.error.value : null"
    quick-create
    @retry="task.load(true)"
    @created="task.load(true)"
    @open-plan="emit('select', $event)"
    @view-all="emit('view-all')"
  />
</template>
