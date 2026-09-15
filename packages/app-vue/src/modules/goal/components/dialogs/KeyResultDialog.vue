<template>
  <Dialog :open="open" @update:open="setOpen">
    <ProductDialogShell
      :open="open"
      test-id="key-result-dialog"
      size="md"
      initial-focus-selector="[data-testid='key-result-title-input']"
    >
      <template #title>
        {{ editing ? t('goal.krDialog.editTitle') : t('goal.krDialog.createTitle') }}
      </template>
      <template #description>
        {{ t('goal.krDialog.descriptionText') }}
      </template>

      <form id="kr-form" class="space-y-4" @submit.prevent="submit">
        <div
          v-if="submitError"
          role="alert"
          class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {{ submitError }}
        </div>

        <div class="space-y-2">
          <Label for="key-result-title">{{ t('goal.krDialog.name') }}</Label>
          <Input
            id="key-result-title"
            v-model="draft.title"
            data-testid="key-result-title-input"
            maxlength="256"
          />
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          <div class="space-y-2">
            <Label for="key-result-initial">{{ t('goal.dialog.krInitialValue') }}</Label>
            <Input
              id="key-result-initial"
              v-model.number="draft.initialValue"
              type="number"
              data-testid="key-result-initial-input"
            />
          </div>
          <div class="space-y-2">
            <Label for="key-result-current">{{ t('goal.dialog.krCurrentValue') }}</Label>
            <Input
              id="key-result-current"
              v-model.number="draft.currentValue"
              type="number"
              data-testid="key-result-current-input"
            />
          </div>
          <div class="space-y-2">
            <Label for="key-result-target">{{ t('goal.dialog.krTargetValue') }}</Label>
            <Input
              id="key-result-target"
              v-model.number="draft.targetValue"
              type="number"
              data-testid="key-result-target-input"
            />
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-2">
            <Label for="key-result-unit">{{ t('goal.dialog.krUnit') }}</Label>
            <Input id="key-result-unit" v-model="draft.unit" maxlength="20" />
          </div>
          <div class="space-y-2">
            <Label>{{ t('goal.dialog.krTargetTimeframe') }}</Label>
            <GoalTimeframePicker
              v-model="draft.target"
              test-id="key-result-target-chip"
              :aria-label="t('goal.dialog.krTargetTimeframe')"
              :placeholder="t('goal.dialog.krTargetTimeframe')"
            />
          </div>
        </div>

        <Collapsible v-model:open="advancedOpen">
          <CollapsibleTrigger as-child>
            <Button type="button" variant="ghost" size="sm" class="px-0 text-muted-foreground">
              <ChevronRight
                class="mr-1 h-4 w-4 transition-transform"
                :class="advancedOpen ? 'rotate-90' : ''"
              />
              {{ t('goal.dialog.krAdvanced') }}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent class="mt-2 space-y-3">
            <div class="space-y-2">
              <Label for="key-result-description">{{ t('goal.dialog.description') }}</Label>
              <Textarea id="key-result-description" v-model="draft.description" maxlength="2000" />
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-2">
                <Label>{{ t('goal.dialog.krCalculationMethod') }}</Label>
                <Select v-model="draft.calculationMethod">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="method in methods" :key="method" :value="method">
                      {{ method }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div class="space-y-2">
                <Label for="key-result-weight">{{ t('goal.dialog.krWeightLabel') }}</Label>
                <Input
                  id="key-result-weight"
                  v-model.number="draft.weight"
                  type="number"
                  min="1"
                  max="5"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </form>

      <template #footer>
        <Button variant="ghost" :disabled="isSubmitting" @click="setOpen(false)">
          {{ t('common.cancel') }}
        </Button>
        <Button
          type="submit"
          form="kr-form"
          data-testid="save-key-result-button"
          :disabled="!draft.title.trim() || isSubmitting"
        >
          {{ t('common.save') }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronRight } from '@lucide/vue';
import {
  KeyResultCalculationMethod,
  type AddKeyResultReq,
  type GoalTimeframe,
  type KeyResultClientDTO,
} from '@memoflow/contracts/goal';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@memoflow/ui-vue-shadcn';
import { ProductDialogShell } from '../../../../shared/components';
import GoalTimeframePicker from '../GoalTimeframePicker.vue';

type KeyResultInput = Omit<AddKeyResultReq, 'goalId' | 'expectedVersion'>;

const props = defineProps<{
  onSubmit: (payload: {
    goalId: string;
    keyResult: KeyResultInput;
    isEditing: boolean;
    keyResultId?: string;
  }) => Promise<boolean> | boolean;
}>();

const { t } = useI18n();
const open = ref(false);
const editing = ref(false);
const goalId = ref('');
const keyResultId = ref<string>();
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);
const advancedOpen = ref(false);
const methods = Object.values(KeyResultCalculationMethod);
const draft = reactive({
  title: '',
  description: '',
  calculationMethod: KeyResultCalculationMethod.Sum as KeyResultInput['calculationMethod'],
  initialValue: 0,
  currentValue: 0,
  targetValue: 100,
  target: null as GoalTimeframe | null,
  unit: '',
  weight: 3,
});

function reset(): void {
  draft.title = '';
  draft.description = '';
  draft.calculationMethod = KeyResultCalculationMethod.Sum;
  draft.initialValue = 0;
  draft.currentValue = 0;
  draft.targetValue = 100;
  draft.target = null;
  draft.unit = '';
  draft.weight = 3;
  advancedOpen.value = false;
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
  open.value = true;
}

function setOpen(value: boolean): void {
  if (!value && isSubmitting.value) return;
  open.value = value;
  if (!value) submitError.value = null;
}

async function submit(): Promise<void> {
  if (!draft.title.trim() || isSubmitting.value) return;
  const initialValue = Number(draft.initialValue);
  const currentValue = Number(draft.currentValue);
  const targetValue = Number(draft.targetValue);
  if (![initialValue, currentValue, targetValue].every(Number.isFinite)) {
    submitError.value = t('common.operationFailed');
    return;
  }
  if (initialValue === targetValue) {
    submitError.value = t('goal.dialog.krInitialTargetConflict');
    return;
  }

  const keyResult: KeyResultInput = {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    calculationMethod: draft.calculationMethod,
    initialValue,
    currentValue,
    targetValue,
    target: draft.target,
    unit: draft.unit.trim() || null,
    weight: Math.max(1, Math.min(5, Math.round(Number(draft.weight)))),
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
