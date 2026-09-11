<template>
  <Dialog :open="open" @update:open="setOpen">
    <ProductDialogShell
      :open="open"
      test-id="goal-dialog"
      size="lg"
      initial-focus-selector="[data-testid='goal-name-input']"
    >
      <template #title>
        {{ mode === 'edit' ? t('goal.dialog.editGoal') : t('goal.dialog.createGoal') }}
      </template>
      <template #description>{{ t('goal.dialog.vNextDescription') }}</template>

      <form id="goal-form" class="space-y-6" @submit.prevent="save">
        <div class="space-y-2">
          <Label for="goal-name">{{ t('goal.dialog.goalTitle') }}</Label>
          <Input
            id="goal-name"
            v-model="draft.name"
            data-testid="goal-name-input"
            maxlength="256"
            :placeholder="t('goal.dialog.goalTitlePlaceholder')"
          />
        </div>

        <div class="space-y-2">
          <Label for="goal-summary">{{ t('goal.dialog.summary') }}</Label>
          <Textarea
            id="goal-summary"
            v-model="draft.summary"
            data-testid="goal-summary-input"
            class="min-h-24"
            maxlength="500"
            :placeholder="t('goal.dialog.summaryPlaceholder')"
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <Label for="goal-start-date">{{ t('goal.dialog.startDate') }}</Label>
            <Input id="goal-start-date" v-model="draft.startDate" type="date" />
          </div>
          <div class="space-y-2">
            <Label for="goal-due-date">{{ t('goal.dialog.dueDate') }}</Label>
            <Input id="goal-due-date" v-model="draft.dueDate" type="date" />
          </div>
        </div>

        <div class="space-y-2">
          <Label>{{ t('goal.dialog.labels') }}</Label>
          <LabelPicker
            v-model="draft.labelIds"
            :options="labelOptions"
            :disabled="labelsLoading || isSaving"
            :placeholder="t('goal.dialog.labelsPlaceholder')"
            :search-placeholder="t('goal.list.searchLabels')"
            :empty-text="t('goal.list.noLabels')"
            :create-label="t('goal.dialog.createLabel')"
            :aria-label="t('goal.dialog.labels')"
            @create="createAndSelectLabel"
          />
          <p v-if="labelCreateError" role="alert" class="text-xs text-destructive">
            {{ labelCreateError }}
          </p>
        </div>

        <section class="space-y-3" data-testid="goal-key-results-editor">
          <div class="flex items-center justify-between gap-3">
            <div>
              <Label>{{ t('goal.dialog.keyResults') }}</Label>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ t('goal.dialog.keyResultsHint') }}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="add-key-result-entry"
              :disabled="krEditorOpen"
              @click="openAddKeyResult"
            >
              <Plus class="mr-1 h-4 w-4" />
              {{ t('goal.dialog.addKeyResult') }}
            </Button>
          </div>

          <div
            v-if="draft.keyResults.length === 0 && !krEditorOpen"
            class="rounded-lg border border-dashed px-4 py-6 text-center"
            data-testid="goal-key-results-empty"
          >
            <p class="text-sm font-medium">{{ t('goal.dialog.krEmptyTitle') }}</p>
            <p class="mt-1 text-xs text-muted-foreground">{{ t('goal.dialog.krEmptyDesc') }}</p>
          </div>

          <div v-else-if="draft.keyResults.length > 0" class="divide-y rounded-lg border">
            <div
              v-for="(keyResult, index) in draft.keyResults"
              :key="keyResult.id ?? `new-${index}`"
              class="flex items-center gap-3 px-3 py-3"
              data-testid="goal-key-result-draft-row"
            >
              <button
                type="button"
                class="min-w-0 flex-1 text-left"
                @click="openEditKeyResult(index)"
              >
                <p class="truncate text-sm font-medium">{{ keyResult.title }}</p>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {{ keyResult.currentValue ?? keyResult.startingValue ?? 0 }} →
                  {{ keyResult.targetValue }}
                  <span v-if="keyResult.unit"> {{ keyResult.unit }}</span>
                </p>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                :aria-label="t('common.edit')"
                :disabled="krEditorOpen"
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
                :disabled="krEditorOpen"
                @click="removeKeyResult(index)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div
            v-if="krEditorOpen"
            class="space-y-4 rounded-lg border bg-muted/20 p-4"
            data-testid="key-result-draft-form"
          >
            <div class="space-y-2">
              <Label for="draft-kr-title">{{ t('goal.dialog.krTitle') }}</Label>
              <Input
                id="draft-kr-title"
                v-model="krForm.title"
                data-testid="draft-kr-title-input"
                maxlength="200"
              />
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-2">
                <Label for="draft-kr-current">{{ t('goal.dialog.krCurrentValue') }}</Label>
                <Input
                  id="draft-kr-current"
                  v-model.number="krForm.currentValue"
                  type="number"
                  data-testid="draft-kr-current-input"
                />
              </div>
              <div class="space-y-2">
                <Label for="draft-kr-target">{{ t('goal.dialog.krTargetValue') }}</Label>
                <Input
                  id="draft-kr-target"
                  v-model.number="krForm.targetValue"
                  type="number"
                  data-testid="draft-kr-target-input"
                />
              </div>
            </div>

            <div class="space-y-2">
              <Label for="draft-kr-unit">{{ t('goal.dialog.krUnit') }}</Label>
              <Input
                id="draft-kr-unit"
                v-model="krForm.unit"
                data-testid="draft-kr-unit-input"
                maxlength="20"
                :placeholder="t('goal.dialog.krUnitPlaceholder')"
              />
            </div>

            <Collapsible v-model:open="krAdvancedOpen">
              <CollapsibleTrigger as-child>
                <Button type="button" variant="ghost" size="sm" class="px-0 text-muted-foreground">
                  <ChevronRight
                    class="mr-1 h-4 w-4 transition-transform"
                    :class="krAdvancedOpen ? 'rotate-90' : ''"
                  />
                  {{ t('goal.dialog.krAdvanced') }}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent class="mt-2 grid gap-3 sm:grid-cols-2">
                <div class="space-y-2 sm:col-span-2">
                  <Label for="draft-kr-baseline">{{ t('goal.dialog.krProgressBaseline') }}</Label>
                  <Input
                    id="draft-kr-baseline"
                    v-model="krForm.progressBaselineValue"
                    type="number"
                    :placeholder="t('goal.dialog.optional')"
                  />
                  <p class="text-[11px] text-muted-foreground">
                    {{ t('goal.dialog.krProgressBaselineHint') }}
                  </p>
                </div>
                <div class="space-y-2">
                  <Label>{{ t('goal.dialog.krCalculationMethod') }}</Label>
                  <Select v-model="krForm.calculationMethod">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="method in calculationMethods"
                        :key="method"
                        :value="method"
                      >
                        {{ calculationMethodLabel(method) }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div class="space-y-2">
                  <Label for="draft-kr-weight">{{ t('goal.dialog.krWeightLabel') }}</Label>
                  <Input
                    id="draft-kr-weight"
                    v-model.number="krForm.weight"
                    type="number"
                    min="1"
                    max="5"
                  />
                  <p class="text-[11px] text-muted-foreground">
                    {{ t('goal.dialog.krWeightHint') }}
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <p v-if="krFormError" role="alert" class="text-xs text-destructive">
              {{ krFormError }}
            </p>
            <div class="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" @click="cancelKeyResultEdit">
                {{ t('common.cancel') }}
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="save-key-result-draft"
                :disabled="!canSaveKeyResult"
                @click="saveKeyResultDraft"
              >
                {{ editingKrIndex === null ? t('goal.dialog.addKeyResult') : t('common.save') }}
              </Button>
            </div>
          </div>
        </section>
      </form>

      <template #footer>
        <Button variant="ghost" :disabled="isSaving" @click="setOpen(false)">
          {{ t('common.cancel') }}
        </Button>
        <Button
          type="submit"
          form="goal-form"
          data-testid="save-goal-button"
          :disabled="!draft.name.trim() || isSaving || krEditorOpen"
        >
          {{ mode === 'edit' ? t('goal.dialog.saveChanges') : t('goal.dialog.createGoal') }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronRight, Pencil, Plus, Trash2 } from '@lucide/vue';
import {
  KeyResultCalculationMethod,
  type GoalClientDTO,
  type CreateGoalReq,
  type UpdateGoalReq,
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
import { LabelPicker, ProductDialogShell } from '../../../../shared/components';
import {
  fromProductDateInputValue,
  toProductDateInputValue,
} from '../../../../shared/utils/product-time';
import { useLabelCatalog } from '../../../../shared/composables/useLabelCatalog';
import { useGoal } from '../../composables/useGoal';

type DraftKeyResult = NonNullable<UpdateGoalReq['keyResults']>[number];
type KrId = DraftKeyResult['id'];

const props = withDefaults(
  defineProps<{ open: boolean; mode?: 'create' | 'edit'; goal?: GoalClientDTO | null }>(),
  { mode: 'create', goal: null },
);
const emit = defineEmits<{
  'update:open': [boolean];
  created: [GoalClientDTO];
  updated: [GoalClientDTO];
  'dirty-change': [boolean];
}>();

const { t } = useI18n();
const { createGoal, updateGoal, isSaving } = useGoal();
const { options: labelOptions, isLoading: labelsLoading, createLabel } = useLabelCatalog();

const draft = reactive({
  name: '',
  summary: '',
  startDate: '',
  dueDate: '',
  labelIds: [] as string[],
  keyResults: [] as DraftKeyResult[],
});
const initialSnapshot = ref('');
const labelCreateError = ref<string | null>(null);
const krEditorOpen = ref(false);
const editingKrIndex = ref<number | null>(null);
const krAdvancedOpen = ref(false);
const krFormError = ref<string | null>(null);
const calculationMethods = Object.values(KeyResultCalculationMethod);
const krForm = reactive({
  id: undefined as KrId | undefined,
  title: '',
  description: null as string | null,
  startingValue: 0,
  currentValue: 0,
  targetValue: '' as number | '',
  progressBaselineValue: '' as number | '',
  calculationMethod: KeyResultCalculationMethod.Sum as KeyResultCalculationMethod,
  unit: '',
  weight: 3,
});

const canSaveKeyResult = computed(
  () =>
    krForm.title.trim().length > 0 &&
    krForm.targetValue !== '' &&
    Number.isFinite(Number(krForm.currentValue)) &&
    Number.isFinite(Number(krForm.targetValue)),
);

function snapshotDraft(): string {
  return JSON.stringify(draft);
}
function fromMs(value: number | null | undefined): string {
  return toProductDateInputValue(value);
}
function toMs(value: string): number | undefined {
  return fromProductDateInputValue(value) ?? undefined;
}
function mapKeyResult(goalKr: NonNullable<GoalClientDTO['keyResults']>[number]): DraftKeyResult {
  return {
    id: goalKr.id,
    title: goalKr.title,
    description: goalKr.description,
    calculationMethod: goalKr.progress.aggregationMethod,
    startingValue: goalKr.progress.startingValue,
    currentValue: goalKr.progress.currentValue,
    targetValue: goalKr.progress.targetValue,
    progressBaselineValue: goalKr.progress.progressBaselineValue,
    unit: goalKr.progress.unit,
    weight: goalKr.weight,
  };
}
function reset(): void {
  draft.name = props.goal?.name ?? '';
  draft.summary = props.goal?.summary ?? '';
  draft.startDate = fromMs(props.goal?.startDate);
  draft.dueDate = fromMs(props.goal?.dueDate);
  draft.labelIds = props.goal?.labels.map((label) => label.id) ?? [];
  draft.keyResults = props.goal?.keyResults?.map(mapKeyResult) ?? [];
  labelCreateError.value = null;
  cancelKeyResultEdit();
  initialSnapshot.value = snapshotDraft();
  emit('dirty-change', false);
}

watch(
  () => [props.open, props.goal?.id] as const,
  ([isOpen]) => {
    if (isOpen) reset();
  },
  { immediate: true, deep: false },
);
watch(draft, () => emit('dirty-change', props.open && snapshotDraft() !== initialSnapshot.value), {
  deep: true,
});

function setOpen(value: boolean): void {
  emit('update:open', value);
  if (!value) emit('dirty-change', false);
}

async function createAndSelectLabel(name: string): Promise<void> {
  labelCreateError.value = null;
  try {
    const label = await createLabel(name);
    if (!draft.labelIds.includes(label.id)) draft.labelIds.push(label.id);
  } catch {
    labelCreateError.value = t('common.operationFailed');
  }
}

function resetKrForm(): void {
  krForm.id = undefined;
  krForm.title = '';
  krForm.description = null;
  krForm.startingValue = 0;
  krForm.currentValue = 0;
  krForm.targetValue = '';
  krForm.progressBaselineValue = '';
  krForm.calculationMethod = KeyResultCalculationMethod.Sum;
  krForm.unit = '';
  krForm.weight = 3;
  krFormError.value = null;
  krAdvancedOpen.value = false;
}
function openAddKeyResult(): void {
  resetKrForm();
  editingKrIndex.value = null;
  krEditorOpen.value = true;
}
function openEditKeyResult(index: number): void {
  if (krEditorOpen.value) return;
  const keyResult = draft.keyResults[index];
  if (!keyResult) return;
  resetKrForm();
  editingKrIndex.value = index;
  krForm.id = keyResult.id;
  krForm.title = keyResult.title;
  krForm.description = keyResult.description ?? null;
  krForm.startingValue = keyResult.startingValue ?? keyResult.currentValue ?? 0;
  krForm.currentValue = keyResult.currentValue ?? keyResult.startingValue ?? 0;
  krForm.targetValue = keyResult.targetValue;
  krForm.progressBaselineValue = keyResult.progressBaselineValue ?? '';
  krForm.calculationMethod = keyResult.calculationMethod;
  krForm.unit = keyResult.unit ?? '';
  krForm.weight = keyResult.weight;
  krEditorOpen.value = true;
}
function cancelKeyResultEdit(): void {
  krEditorOpen.value = false;
  editingKrIndex.value = null;
  resetKrForm();
}
function validateKrMeasurement(): boolean {
  krFormError.value = null;
  const current = Number(krForm.currentValue);
  const target = Number(krForm.targetValue);
  const baseline =
    krForm.progressBaselineValue === '' ? null : Number(krForm.progressBaselineValue);
  const isNew = editingKrIndex.value === null;
  const starting = isNew ? current : Number(krForm.startingValue);

  if (baseline === null && (target <= 0 || target < starting)) {
    krFormError.value = t('goal.dialog.krBaselineRequired');
    krAdvancedOpen.value = true;
    return false;
  }
  if (baseline !== null && baseline === target) {
    krFormError.value = t('goal.dialog.krBaselineTargetConflict');
    krAdvancedOpen.value = true;
    return false;
  }
  return true;
}
function saveKeyResultDraft(): void {
  if (!canSaveKeyResult.value || !validateKrMeasurement()) return;
  const current = Number(krForm.currentValue);
  const keyResult: DraftKeyResult = {
    ...(krForm.id ? { id: krForm.id } : {}),
    title: krForm.title.trim(),
    description: krForm.description,
    calculationMethod: krForm.calculationMethod,
    startingValue: editingKrIndex.value === null ? current : Number(krForm.startingValue),
    currentValue: current,
    targetValue: Number(krForm.targetValue),
    progressBaselineValue:
      krForm.progressBaselineValue === '' ? null : Number(krForm.progressBaselineValue),
    unit: krForm.unit.trim() || null,
    weight: Math.max(1, Math.min(5, Math.round(Number(krForm.weight) || 3))),
  };
  if (editingKrIndex.value === null) draft.keyResults.push(keyResult);
  else draft.keyResults.splice(editingKrIndex.value, 1, keyResult);
  cancelKeyResultEdit();
}
function removeKeyResult(index: number): void {
  draft.keyResults.splice(index, 1);
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

async function save(): Promise<void> {
  if (!draft.name.trim() || krEditorOpen.value) return;
  const labelIds = [...draft.labelIds];
  const keyResults = draft.keyResults.map((item) => ({ ...item }));
  const common = {
    name: draft.name.trim(),
    summary: draft.summary.trim() || undefined,
    startDate: toMs(draft.startDate),
    dueDate: toMs(draft.dueDate),
    labelIds,
  };

  if (props.mode === 'edit' && props.goal) {
    const req: UpdateGoalReq = {
      expectedVersion: props.goal.version,
      ...common,
      summary: common.summary ?? null,
      startDate: common.startDate ?? null,
      dueDate: common.dueDate ?? null,
      keyResults,
    };
    const saved = await updateGoal(String(props.goal.id), req);
    if (saved) {
      emit('updated', saved);
      setOpen(false);
    }
    return;
  }

  const req: CreateGoalReq = {
    ...common,
    initialKeyResults: keyResults.map(({ id: _id, ...item }) => item),
  };
  const saved = await createGoal(req);
  if (saved) {
    emit('created', saved);
    setOpen(false);
  }
}
</script>
