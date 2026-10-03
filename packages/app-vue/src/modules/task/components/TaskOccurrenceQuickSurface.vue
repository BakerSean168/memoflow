<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTaskOccurrenceDetailQuery } from '../composables/useTaskOccurrenceDetailQuery';
import { useTaskPlanDetailQuery } from '../composables/useTaskPlanDetailQuery';
import TaskQuickSurface from './TaskQuickSurface.vue';

const props = defineProps<{ occurrenceId: string }>();
const emit = defineEmits<{ 'open-plan': [id: string] }>();
const { t } = useI18n();
const detail = useTaskOccurrenceDetailQuery(() => props.occurrenceId);
const plan = useTaskPlanDetailQuery(() => detail.occurrence.value?.planId);
const ready = computed(() => detail.occurrence.value && plan.currentTemplate.value);
const loading = computed(
  () => detail.isLoading.value || (!!detail.occurrence.value && plan.isLoading.value),
);
const error = computed(() => detail.error.value ?? plan.error.value);
async function retry() {
  await detail.refetch();
  if (detail.occurrence.value) await plan.refetch();
}
</script>

<template>
  <TaskQuickSurface
    :title="t('task.management.title')"
    :occurrences="ready ? [detail.occurrence.value!] : []"
    :templates="ready ? [plan.currentTemplate.value!] : []"
    :loading="loading"
    :error="error"
    :summary="false"
    :view-all="false"
    @retry="retry"
    @open-plan="emit('open-plan', $event)"
  />
</template>
