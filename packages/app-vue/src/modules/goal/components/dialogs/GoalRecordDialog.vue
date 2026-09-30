<template>
  <Dialog
    :open="visible"
    @update:open="
      (open) => {
        if (!isSubmitting) visible = open;
      }
    "
  >
    <ProductDialogShell
      :open="visible"
      test-id="goal-record-dialog"
      size="sm"
      initial-focus-selector="#change-amount"
      @keydown.esc="handleCancel"
    >
      <template #title>{{
        record ? t('goal.recordDialog.editTitle') : t('goal.recordDialog.addTitle')
      }}</template>
      <template #description>{{ t('goal.recordDialog.description') }}</template>
      <GoalRecordComposerSurface
        v-if="visible"
        :key="session"
        ref="composer"
        :goal-id="goalId"
        :key-result-id="keyResultId"
        :initial-value="record?.value"
        :initial-note="record?.comment ?? ''"
        :editing="!!record"
        :disabled="isSubmitting || !editable"
        @validity-change="isValid = $event"
        @submit="handleSave"
        @cancel="handleCancel"
      />
      <p v-if="!editable" class="text-xs text-muted-foreground">
        {{ t('goal.recordDialog.editNotAllowed') }}
      </p>
      <p v-if="submitError" role="alert" class="text-xs text-destructive">{{ submitError }}</p>
      <template #footer>
        <Button type="button" variant="ghost" :disabled="isSubmitting" @click="handleCancel">{{
          t('goal.recordDialog.cancel')
        }}</Button>
        <Button
          type="button"
          data-testid="save-goal-record"
          :disabled="!isValid || isSubmitting || !editable"
          :loading="isSubmitting"
          @click="composer?.submit()"
          >{{ t('goal.recordDialog.save') }}</Button
        >
      </template>
    </ProductDialogShell>
  </Dialog>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { GoalRecordClientDTO } from '@memoflow/contracts/goal';
import { Button, Dialog } from '@memoflow/ui-vue-shadcn';
import { ProductDialogShell } from '../../../../shared/components';
import GoalRecordComposerSurface from '../GoalRecordComposerSurface.vue';
import { useGoal } from '../../composables/useGoal';
const { createGoalRecord, updateGoalRecord } = useGoal();
const { t } = useI18n();
const emit = defineEmits<{ saved: [] }>();
const visible = ref(false);
const goalId = ref('');
const keyResultId = ref('');
const record = ref<GoalRecordClientDTO | null>(null);
const session = ref(0);
const isSubmitting = ref(false);
const isValid = ref(false);
const submitError = ref('');
const composer = ref<InstanceType<typeof GoalRecordComposerSurface> | null>(null);
const editable = computed(
  () =>
    !record.value ||
    record.value.authorship === 'Manual' ||
    record.value.authorship === 'TaskUserMeasurement',
);
async function handleSave(intent: { value: number; note: string }) {
  if (!isValid.value || isSubmitting.value || !editable.value) return;
  submitError.value = '';
  isSubmitting.value = true;
  try {
    const result = record.value
      ? await updateGoalRecord(goalId.value, keyResultId.value, String(record.value.id), intent)
      : await createGoalRecord(goalId.value, keyResultId.value, intent);
    if (result) {
      visible.value = false;
      emit('saved');
    } else
      submitError.value = t(
        record.value ? 'goal.error.updateRecordFailed' : 'goal.error.createRecordFailed',
      );
  } catch {
    submitError.value = t(
      record.value ? 'goal.error.updateRecordFailed' : 'goal.error.createRecordFailed',
    );
  } finally {
    isSubmitting.value = false;
  }
}
function handleCancel() {
  if (!isSubmitting.value) visible.value = false;
}
function openDialog(nextGoalId: string, nextKeyResultId: string, nextRecord?: GoalRecordClientDTO) {
  if (isSubmitting.value) return;
  goalId.value = nextGoalId;
  keyResultId.value = nextKeyResultId;
  record.value = nextRecord ?? null;
  submitError.value = '';
  isValid.value = false;
  session.value++;
  visible.value = true;
}
defineExpose({ openDialog });
</script>
