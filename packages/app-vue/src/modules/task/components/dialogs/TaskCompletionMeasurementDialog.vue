<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog } from '@memoflow/ui-vue-shadcn';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import { GoalRecordComposerSurface } from '../../../goal';
import { ProductDialogShell } from '../../../../shared/components';
import type { useTaskOccurrenceActionCoordinator } from '../../composables/useTaskOccurrenceActionCoordinator';
const props = defineProps<{ coordinator: ReturnType<typeof useTaskOccurrenceActionCoordinator> }>();
const emit = defineEmits<{ completed: [occurrence: TaskOccurrenceClientDTO] }>();
const { t } = useI18n();
const session = computed(() => props.coordinator.pendingMeasurement.value);
const busy = computed(() => props.coordinator.busyOccurrenceId.value !== null);
const composer = ref<InstanceType<typeof GoalRecordComposerSurface> | null>(null);
const valid = ref(false);
const failed = ref(false);
const composerSession = ref(0);
watch(
  session,
  () => {
    composerSession.value++;
    valid.value = false;
    failed.value = false;
  },
  { flush: 'sync' },
);
async function complete(intent?: { value: number; note: string }) {
  if (busy.value) return;
  failed.value = false;
  try {
    const result = intent
      ? await props.coordinator.submitMeasurement(intent.value, intent.note)
      : await props.coordinator.completeWithoutMeasurement();
    if (result) emit('completed', result);
    else failed.value = true;
  } catch {
    failed.value = true;
  }
}
</script>

<template>
  <Dialog
    v-if="session"
    :open="true"
    @update:open="
      (open) => {
        if (!open) coordinator.cancelMeasurement();
      }
    "
  >
    <ProductDialogShell
      :open="true"
      test-id="task-completion-measurement-dialog"
      size="sm"
      initial-focus-selector="#change-amount"
      @keydown.esc="coordinator.cancelMeasurement()"
    >
      <template #title>{{ t('task.measurement.title') }}</template>
      <template #description>{{ t('task.measurement.description') }}</template>
      <GoalRecordComposerSurface
        :key="composerSession"
        ref="composer"
        :goal-id="session.goalId"
        :key-result-id="session.keyResultId"
        :initial-value="session.suggestedValue"
        :disabled="busy"
        @validity-change="valid = $event"
        @submit="complete"
        @cancel="coordinator.cancelMeasurement()"
      />
      <p v-if="failed" role="alert" class="text-xs text-destructive">
        {{ t('task.measurement.failed') }}
      </p>
      <template #footer>
        <Button
          type="button"
          variant="ghost"
          :disabled="busy"
          @click="coordinator.cancelMeasurement()"
          >{{ t('common.cancel') }}</Button
        >
        <Button
          type="button"
          variant="outline"
          data-testid="task-complete-only"
          :disabled="busy"
          @click="complete()"
          >{{ t('task.measurement.completeOnly') }}</Button
        >
        <Button
          type="button"
          data-testid="task-record-and-complete"
          :disabled="busy || !valid"
          :loading="busy"
          @click="composer?.submit()"
          >{{ t('task.measurement.recordAndComplete') }}</Button
        >
      </template>
    </ProductDialogShell>
  </Dialog>
</template>
