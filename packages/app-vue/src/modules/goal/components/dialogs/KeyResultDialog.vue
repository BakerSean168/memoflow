<template>
  <Dialog :open="open" @update:open="setOpen">
    <ProductDialogShell
      :open="open"
      test-id="key-result-dialog"
      size="lg"
      initial-focus-selector="[data-testid='draft-kr-title-input']"
      content-class="sm:max-w-[860px]"
    >
      <template #title>
        {{ editing ? t('goal.krDialog.editTitle') : t('goal.krDialog.createTitle') }}
      </template>

      <form id="kr-form" class="space-y-4" @submit.prevent="submit">
        <GoalKeyResultCardEditor
          v-model:title="draft.title"
          v-model:description="draft.description"
          v-model:initial-value="draft.initialValue"
          v-model:current-value="currentValueModel"
          v-model:target-value="draft.targetValue"
          v-model:target="draft.target"
          v-model:calculation-method="draft.calculationMethod"
          v-model:unit="draft.unit"
          v-model:weight="draft.weight"
          :goal-start="goalStart"
          :goal-target="goalTarget"
          :disabled="isSubmitting"
        />

        <p v-if="submitError" role="alert" class="text-xs text-destructive">
          {{ submitError }}
        </p>
      </form>

      <template #footer>
        <Button variant="ghost" :disabled="isSubmitting" @click="setOpen(false)">
          {{ t('common.cancel') }}
        </Button>
        <Button
          type="submit"
          form="kr-form"
          data-testid="save-key-result-button"
          :disabled="!canSave || isSubmitting"
        >
          {{ editing ? t('common.save') : t('goal.dialog.addKeyResult') }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  KeyResultCalculationMethod,
  type AddKeyResultReq,
  type GoalTimeframe,
  type KeyResultClientDTO,
} from '@memoflow/contracts/goal';
import { Button, Dialog } from '@memoflow/ui-vue-shadcn';
import { ProductDialogShell } from '../../../../shared/components';
import GoalKeyResultCardEditor from '../GoalKeyResultCardEditor.vue';

type KeyResultInput = Omit<AddKeyResultReq, 'goalId' | 'expectedVersion'>;

const props = withDefaults(
  defineProps<{
    onSubmit: (payload: {
      goalId: string;
      keyResult: KeyResultInput;
      isEditing: boolean;
      keyResultId?: string;
    }) => Promise<boolean> | boolean;
    goalStart?: GoalTimeframe | null;
    goalTarget?: GoalTimeframe | null;
  }>(),
  {
    goalStart: null,
    goalTarget: null,
  },
);

const { t } = useI18n();
const open = ref(false);
const editing = ref(false);
const goalId = ref('');
const keyResultId = ref<string>();
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);
const currentFollowsInitial = ref(true);

const draft = reactive({
  title: '',
  description: '',
  calculationMethod: KeyResultCalculationMethod.Sum as KeyResultInput['calculationMethod'],
  initialValue: 0,
  currentValue: 0,
  targetValue: '' as number | '',
  target: null as GoalTimeframe | null,
  unit: '',
  weight: 3,
});

const canSave = computed(
  () =>
    draft.title.trim().length > 0 &&
    draft.targetValue !== '' &&
    Number.isFinite(Number(draft.initialValue)) &&
    Number.isFinite(Number(draft.currentValue)) &&
    Number.isFinite(Number(draft.targetValue)),
);

const currentValueModel = computed({
  get: () => draft.currentValue,
  set: (value: number) => {
    currentFollowsInitial.value = false;
    draft.currentValue = value;
  },
});

watch(
  () => draft.initialValue,
  (value) => {
    if (currentFollowsInitial.value) draft.currentValue = Number(value);
  },
);

function reset(): void {
  draft.title = '';
  draft.description = '';
  draft.calculationMethod = KeyResultCalculationMethod.Sum;
  draft.initialValue = 0;
  draft.currentValue = 0;
  draft.targetValue = '';
  draft.target = null;
  draft.unit = '';
  draft.weight = 3;
  currentFollowsInitial.value = true;
  submitError.value = null;
  isSubmitting.value = false;
}

function openForCreateKeyResult(id: string): void {
  reset();
  goalId.value = id;
  keyResultId.value = undefined;
  editing.value = false;
  open.value = true;
}

function openForUpdateKeyResult(id: string, keyResult: KeyResultClientDTO): void {
  reset();
  goalId.value = id;
  keyResultId.value = String(keyResult.id);
  editing.value = true;
  draft.title = keyResult.title;
  draft.description = keyResult.description ?? '';
  draft.calculationMethod = keyResult.progress.aggregationMethod;
  draft.initialValue = keyResult.progress.initialValue;
  draft.currentValue = keyResult.progress.currentValue;
  draft.targetValue = keyResult.progress.targetValue;
  draft.target = keyResult.target ? { ...keyResult.target } : null;
  draft.unit = keyResult.progress.unit ?? '';
  draft.weight = keyResult.weight;
  currentFollowsInitial.value = false;
  open.value = true;
}

function setOpen(value: boolean): void {
  if (!value && isSubmitting.value) return;
  open.value = value;
  if (!value) submitError.value = null;
}

function validateMeasurement(): boolean {
  submitError.value = null;
  const initialValue = Number(draft.initialValue);
  const currentValue = Number(draft.currentValue);
  const targetValue = Number(draft.targetValue);

  if (![initialValue, currentValue, targetValue].every(Number.isFinite)) {
    submitError.value = t('common.operationFailed');
    return false;
  }
  if (initialValue === targetValue) {
    submitError.value = t('goal.dialog.krInitialTargetConflict');
    return false;
  }
  return true;
}

async function submit(): Promise<void> {
  if (!canSave.value || isSubmitting.value || !validateMeasurement()) return;

  const keyResult: KeyResultInput = {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    calculationMethod: draft.calculationMethod,
    initialValue: Number(draft.initialValue),
    currentValue: Number(draft.currentValue),
    targetValue: Number(draft.targetValue),
    target: draft.target,
    unit: draft.unit.trim() || null,
    weight: Math.max(1, Math.min(5, Math.round(Number(draft.weight) || 3))),
  };

  isSubmitting.value = true;
  submitError.value = null;
  try {
    const saved = await props.onSubmit({
      goalId: goalId.value,
      keyResult,
      isEditing: editing.value,
      keyResultId: keyResultId.value,
    });
    if (saved) {
      open.value = false;
      return;
    }
    submitError.value = t('common.operationFailed');
  } catch (error) {
    submitError.value =
      error instanceof Error && error.message ? error.message : t('common.operationFailed');
  } finally {
    isSubmitting.value = false;
  }
}

defineExpose({ openForCreateKeyResult, openForUpdateKeyResult });
</script>
