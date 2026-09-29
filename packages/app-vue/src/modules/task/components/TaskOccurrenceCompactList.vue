<script setup lang="ts">
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import TaskOccurrenceQuickRow from './TaskOccurrenceQuickRow.vue';
withDefaults(
  defineProps<{
    rows: { occurrence: TaskOccurrenceClientDTO; template: TaskPlanClientDTO }[];
    busyOccurrenceId?: string | null;
  }>(),
  { busyOccurrenceId: null },
);
const emit = defineEmits<{
  'open-plan': [id: string];
  complete: [id: string];
  uncomplete: [id: string];
  missed: [id: string];
  skip: [id: string];
  'checklist-change': [
    id: string,
    definitionId: string,
    completed: boolean,
    expectedVersion: number,
  ];
}>();
</script>
<template>
  <TaskOccurrenceQuickRow
    v-for="row in rows"
    :key="row.occurrence.id"
    :occurrence="row.occurrence"
    :template="row.template"
    :busy="busyOccurrenceId === String(row.occurrence.id)"
    :disabled="busyOccurrenceId !== null"
    @open-plan="emit('open-plan', $event)"
    @complete="emit('complete', $event)"
    @uncomplete="emit('uncomplete', $event)"
    @missed="emit('missed', $event)"
    @skip="emit('skip', $event)"
    @checklist-change="
      (id, definitionId, completed, version) =>
        emit('checklist-change', id, definitionId, completed, version)
    "
  />
</template>
