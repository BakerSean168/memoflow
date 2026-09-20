<template>
  <section class="space-y-2" data-testid="goal-key-results-editor">
    <div class="flex items-center justify-between gap-3 px-1">
      <div class="flex min-w-0 items-center gap-2">
        <h3 class="text-sm font-medium">{{ t('goal.dialog.keyResults') }}</h3>
        <span v-if="keyResults.length" class="text-xs tabular-nums text-muted-foreground">
          {{ keyResults.length }}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="h-8 w-8 text-muted-foreground hover:text-foreground"
        :aria-label="t('goal.dialog.addKeyResult')"
        :disabled="disabled || editorOpen"
        data-testid="add-key-result-entry"
        @click="openAddKeyResult"
      >
        <Plus class="h-4 w-4" />
      </Button>
    </div>

    <div v-if="keyResults.length" class="overflow-hidden rounded-lg bg-muted/20">
      <div
        v-for="(keyResult, index) in keyResults"
        :key="keyResult.id ?? `new-${index}`"
        class="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/35"
        :class="index > 0 ? 'border-t border-border/50' : ''"
        data-testid="goal-key-result-draft-row"
      >
        <button
          type="button"
          class="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :disabled="disabled || editorOpen"
          @click="openEditKeyResult(index)"
        >
          <p class="truncate text-sm font-medium">{{ keyResult.title }}</p>
          <p class="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {{ keyResult.currentValue ?? keyResult.initialValue }} → {{ keyResult.targetValue }}
            <span v-if="keyResult.unit"> {{ keyResult.unit }}</span>
          </p>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          :aria-label="t('common.edit')"
          :disabled="disabled || editorOpen"
          @click="openEditKeyResult(index)"
        >
          <Pencil class="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="text-destructive hover:text-destructive"
          :aria-label="t('common.delete')"
          :disabled="disabled || editorOpen"
          @click="removeKeyResult(index)"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>

    <div
      v-else-if="!editorOpen"
      class="rounded-lg bg-muted/15 px-3 py-2.5 text-sm text-muted-foreground"
      data-testid="goal-key-results-empty"
    >
      {{ t('goal.dialog.krEmptyTitle') }}
    </div>

    <div
      v-if="editorOpen"
      class="space-y-4 rounded-lg bg-muted/20 p-4"
      data-testid="key-result-draft-form"
    >
      <div class="rounded-md bg-background/70 px-3 py-2">
        <Label for="draft-kr-title" class="sr-only">{{ t('goal.dialog.krTitle') }}</Label>
        <ProductAutoTextarea
          id="draft-kr-title"
          v-model="form.title"
          :max-length="200"
          :rows="1"
          data-testid="draft-kr-title-input"
          class="min-h-7 text-sm font-medium leading-5"
          :placeholder="t('goal.dialog.inlineKrPlaceholder')"
        />
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div class="space-y-2">
          <Label for="draft-kr-initial">{{ t('goal.dialog.krInitialValue') }}</Label>
          <Input
            id="draft-kr-initial"
            v-model.number="form.initialValue"
            type="number"
            data-testid="draft-kr-initial-input"
          />
        </div>
        <div class="space-y-2">
          <Label for="draft-kr-current">{{ t('goal.dialog.krCurrentValue') }}</Label>
          <Input
            id="draft-kr-current"
            v-model.number="form.currentValue"
            type="number"
            data-testid="draft-kr-current-input"
          />
        </div>
        <div class="space-y-2">
          <Label for="draft-kr-target">{{ t('goal.dialog.krTargetValue') }}</Label>
          <Input
            id="draft-kr-target"
            v-model.number="form.targetValue"
            type="number"
            data-testid="draft-kr-target-input"
          />
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-2">
          <Label for="draft-kr-unit">{{ t('goal.dialog.krUnit') }}</Label>
          <Input
            id="draft-kr-unit"
            v-model="form.unit"
            data-testid="draft-kr-unit-input"
            maxlength="20"
            :placeholder="t('goal.dialog.krUnitPlaceholder')"
          />
        </div>
        <div class="space-y-2">
          <Label>{{ t('goal.dialog.krTargetTimeframe') }}</Label>
          <GoalTimeframePicker
            v-model="form.target"
            test-id="draft-kr-target-timeframe"
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
        <CollapsibleContent class="mt-2 grid gap-3 sm:grid-cols-2">
          <div class="space-y-2 sm:col-span-2">
            <Label for="draft-kr-description">{{ t('goal.dialog.description') }}</Label>
            <Textarea id="draft-kr-description" v-model="form.description" maxlength="2000" />
          </div>
          <div class="space-y-2">
            <Label>{{ t('goal.dialog.krCalculationMethod') }}</Label>
            <Select v-model="form.calculationMethod">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="method in calculationMethods" :key="method" :value="method">
                  {{ calculationMethodLabel(method) }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label for="draft-kr-weight">{{ t('goal.dialog.krWeightLabel') }}</Label>
            <Input
              id="draft-kr-weight"
              v-model.number="form.weight"
              type="number"
              min="1"
              max="5"
            />
            <p class="text-[11px] text-muted-foreground">{{ t('goal.dialog.krWeightHint') }}</p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <p v-if="formError" role="alert" class="text-xs text-destructive">{{ formError }}</p>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" @click="cancelEdit">
          {{ t('common.cancel') }}
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid="save-key-result-draft"
          :disabled="!canSave"
          @click="saveDraft"
        >
          {{ editingIndex === null ? t('goal.dialog.addKeyResult') : t('common.save') }}
        </Button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronRight, Pencil, Plus, Trash2 } from '@lucide/vue';
import {
  KeyResultCalculationMethod,
  type GoalTimeframe,
  type UpdateGoalReq,
} from '@memoflow/contracts/goal';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@memoflow/ui-vue-shadcn';
import GoalTimeframePicker from './GoalTimeframePicker.vue';
import { ProductAutoTextarea } from '../../../shared/components';

type DraftKeyResult = NonNullable<UpdateGoalReq['keyResults']>[number];
type KrId = DraftKeyResult['id'];

const props = withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });
const keyResults = defineModel<DraftKeyResult[]>({ required: true });
const emit = defineEmits<{ 'editing-change': [boolean] }>();
const { t } = useI18n();

const editorOpen = ref(false);
const editingIndex = ref<number | null>(null);
const advancedOpen = ref(false);
const formError = ref<string | null>(null);
const calculationMethods = Object.values(KeyResultCalculationMethod);
const form = reactive({
  id: undefined as KrId | undefined,
  title: '',
  description: '',
  initialValue: 0,
  currentValue: 0,
  targetValue: '' as number | '',
  target: null as GoalTimeframe | null,
  calculationMethod: KeyResultCalculationMethod.Sum as KeyResultCalculationMethod,
  unit: '',
  weight: 3,
});

const canSave = computed(
  () =>
    form.title.trim().length > 0 &&
    form.targetValue !== '' &&
    Number.isFinite(Number(form.initialValue)) &&
    Number.isFinite(Number(form.currentValue)) &&
    Number.isFinite(Number(form.targetValue)),
);

watch(editorOpen, (open) => emit('editing-change', open), { immediate: true });

function resetForm(): void {
  form.id = undefined;
  form.title = '';
  form.description = '';
  form.initialValue = 0;
  form.currentValue = 0;
  form.targetValue = '';
  form.target = null;
  form.calculationMethod = KeyResultCalculationMethod.Sum;
  form.unit = '';
  form.weight = 3;
  formError.value = null;
  advancedOpen.value = false;
}

function openAddKeyResult(): void {
  if (props.disabled || editorOpen.value) return;
  resetForm();
  editingIndex.value = null;
  editorOpen.value = true;
}

function openEditKeyResult(index: number): void {
  if (props.disabled || editorOpen.value) return;
  const keyResult = keyResults.value[index];
  if (!keyResult) return;
  resetForm();
  editingIndex.value = index;
  form.id = keyResult.id;
  form.title = keyResult.title;
  form.description = keyResult.description ?? '';
  form.initialValue = keyResult.initialValue;
  form.currentValue = keyResult.currentValue ?? keyResult.initialValue;
  form.targetValue = keyResult.targetValue;
  form.target = keyResult.target ? { ...keyResult.target } : null;
  form.calculationMethod = keyResult.calculationMethod;
  form.unit = keyResult.unit ?? '';
  form.weight = keyResult.weight;
  editorOpen.value = true;
}

function cancelEdit(): void {
  editorOpen.value = false;
  editingIndex.value = null;
  resetForm();
}

function validateMeasurement(): boolean {
  formError.value = null;
  const initial = Number(form.initialValue);
  const current = Number(form.currentValue);
  const target = Number(form.targetValue);
  if (![initial, current, target].every(Number.isFinite)) {
    formError.value = t('common.operationFailed');
    return false;
  }
  if (initial === target) {
    formError.value = t('goal.dialog.krInitialTargetConflict');
    return false;
  }
  return true;
}

function saveDraft(): void {
  if (!canSave.value || !validateMeasurement()) return;
  const current = Number(form.currentValue);
  const next: DraftKeyResult = {
    ...(form.id ? { id: form.id } : {}),
    title: form.title.trim(),
    description: form.description.trim() || null,
    calculationMethod: form.calculationMethod,
    initialValue: Number(form.initialValue),
    currentValue: current,
    targetValue: Number(form.targetValue),
    target: form.target,
    unit: form.unit.trim() || null,
    weight: Math.max(1, Math.min(5, Math.round(Number(form.weight) || 3))),
  };
  if (editingIndex.value === null) keyResults.value = [...keyResults.value, next];
  else {
    const updated = [...keyResults.value];
    updated.splice(editingIndex.value, 1, next);
    keyResults.value = updated;
  }
  cancelEdit();
}

function removeKeyResult(index: number): void {
  if (props.disabled || editorOpen.value) return;
  keyResults.value = keyResults.value.filter((_, itemIndex) => itemIndex !== index);
}

function calculationMethodLabel(method: KeyResultCalculationMethod): string {
  const labels: Record<KeyResultCalculationMethod, string> = {
    Sum: t('goal.dialog.krCalculationSum'),
    Average: t('goal.dialog.krCalculationAverage'),
    Max: t('goal.dialog.krCalculationMax'),
    Min: t('goal.dialog.krCalculationMin'),
    Last: t('goal.dialog.krCalculationLast'),
  };
  return labels[method];
}
</script>
