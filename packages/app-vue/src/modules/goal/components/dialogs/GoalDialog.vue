<template>
  <Dialog :open="open" @update:open="setOpen">
    <ProductDialogShell
      :open="open"
      test-id="goal-dialog"
      size="lg"
      initial-focus-selector="[data-testid='goal-name-input']"
    >
      <template #title>
        <div class="flex min-w-0 items-center justify-between gap-3">
          <span>{{
            mode === 'edit' ? t('goal.dialog.editGoal') : t('goal.dialog.createGoal')
          }}</span>
          <Button
            v-if="mode === 'create'"
            type="button"
            variant="ghost"
            size="sm"
            data-testid="goal-create-with-ai"
            @click="emit('create-with-ai')"
          >
            <Sparkles class="mr-1 h-4 w-4" />
            {{ t('goal.dialog.createWithAI') }}
          </Button>
        </div>
      </template>
      <template #description>{{ t('goal.dialog.vNextDescription') }}</template>

      <form id="goal-form" class="space-y-6" @submit.prevent="save">
        <div class="space-y-2">
          <Label for="goal-name">{{ t('goal.dialog.goalTitle') }}</Label>
          <Input
            id="goal-name"
            v-model="draft.name"
            data-testid="goal-name-input"
            class="h-11 text-lg font-medium"
            maxlength="256"
            :placeholder="t('goal.dialog.goalTitlePlaceholder')"
          />
        </div>

        <Input
          id="goal-summary"
          v-model="draft.summary"
          data-testid="goal-summary-input"
          maxlength="500"
          :placeholder="t('goal.dialog.summaryPlaceholder')"
        />

        <div class="flex flex-wrap items-center gap-2" data-testid="goal-property-chips">
          <span
            class="inline-flex h-8 items-center rounded-full border bg-background px-3 text-sm"
            data-testid="goal-status-chip"
          >
            {{ goalStatusLabel }}
          </span>

          <Popover>
            <PopoverTrigger as-child>
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-8 rounded-full px-3 font-normal"
                data-testid="goal-start-chip"
              >
                <CalendarDays class="mr-1 h-3.5 w-3.5" />
                {{ startChipLabel }}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" class="w-auto space-y-2 p-3">
              <Label for="goal-start-date">{{ t('goal.dialog.startDate') }}</Label>
              <Input id="goal-start-date" v-model="draft.startDate" type="date" />
              <Button
                v-if="draft.startDate"
                type="button"
                size="sm"
                variant="ghost"
                @click="draft.startDate = ''"
              >
                {{ t('common.clear') }}
              </Button>
            </PopoverContent>
          </Popover>

          <GoalTimeframePicker
            v-model="draft.target"
            test-id="goal-target-chip"
            :aria-label="t('goal.dialog.target')"
            :placeholder="t('goal.dialog.target')"
          />

          <LabelPicker
            v-model="draft.labelIds"
            :options="labelOptions"
            :disabled="labelsLoading || isSaving"
            :placeholder="t('goal.dialog.labels')"
            :search-placeholder="t('goal.list.searchLabels')"
            :empty-text="t('goal.list.noLabels')"
            :create-label="t('goal.dialog.createLabel')"
            :aria-label="t('goal.dialog.labels')"
            compact
            @create="createAndSelectLabel"
          />

          <GoalReminderChip
            v-model="draft.reminderConfig"
            :start-date="draft.startDate || null"
            :target="draft.target"
          />

          <Popover>
            <PopoverTrigger as-child>
              <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-8 rounded-full px-3 font-normal"
                data-testid="goal-notes-chip"
              >
                <NotebookText class="mr-1 h-3.5 w-3.5" />
                {{ t('goal.dialog.notes') }}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" class="w-72 space-y-3 p-3">
              <p class="text-sm text-muted-foreground">{{ t('goal.dialog.notesHint') }}</p>
              <Button
                v-if="mode === 'edit' && goal"
                type="button"
                variant="outline"
                size="sm"
                @click="emit('open-knowledge', String(goal.id))"
              >
                {{ t('goal.dialog.openKnowledge') }}
              </Button>
              <Button
                v-else
                type="button"
                variant="outline"
                size="sm"
                @click="emit('create-with-ai')"
              >
                <Sparkles class="mr-1 h-4 w-4" />
                {{ t('goal.dialog.createWithAI') }}
              </Button>
            </PopoverContent>
          </Popover>
        </div>

        <p v-if="labelCreateError" role="alert" class="text-xs text-destructive">
          {{ labelCreateError }}
        </p>
        <p v-if="formError" role="alert" class="text-xs text-destructive">
          {{ formError }}
        </p>

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
                  {{ keyResult.currentValue ?? keyResult.initialValue }} →
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

            <div class="grid gap-3 sm:grid-cols-3">
              <div class="space-y-2">
                <Label for="draft-kr-initial">{{ t('goal.dialog.krInitialValue') }}</Label>
                <Input
                  id="draft-kr-initial"
                  v-model.number="krForm.initialValue"
                  type="number"
                  data-testid="draft-kr-initial-input"
                />
              </div>
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

            <div class="grid gap-3 sm:grid-cols-2">
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
              <div class="space-y-2">
                <Label>{{ t('goal.dialog.krTargetTimeframe') }}</Label>
                <GoalTimeframePicker
                  v-model="krForm.target"
                  test-id="draft-kr-target-timeframe"
                  :aria-label="t('goal.dialog.krTargetTimeframe')"
                  :placeholder="t('goal.dialog.krTargetTimeframe')"
                />
              </div>
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
                  <Label for="draft-kr-description">{{ t('goal.dialog.description') }}</Label>
                  <Textarea
                    id="draft-kr-description"
                    v-model="krForm.description"
                    maxlength="2000"
                  />
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
import {
  CalendarDays,
  ChevronRight,
  NotebookText,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from '@lucide/vue';
import {
  KeyResultCalculationMethod,
  ReminderTriggerType,
  type GoalReminderConfigDTO,
  type GoalClientDTO,
  type GoalTimeframe,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@memoflow/ui-vue-shadcn';
import { LabelPicker, ProductDialogShell } from '../../../../shared/components';
import GoalReminderChip from '../GoalReminderChip.vue';
import GoalTimeframePicker from '../GoalTimeframePicker.vue';
import {
  fromProductYmdInputValue,
  toProductYmdInputValue,
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
  'create-with-ai': [];
  'open-knowledge': [goalId: string];
}>();

const { t } = useI18n();
const { createGoal, updateGoal, isSaving } = useGoal();
const { options: labelOptions, isLoading: labelsLoading, createLabel } = useLabelCatalog();

const draft = reactive({
  name: '',
  summary: '',
  startDate: '',
  target: null as GoalTimeframe | null,
  reminderConfig: null as GoalReminderConfigDTO | null,
  labelIds: [] as string[],
  keyResults: [] as DraftKeyResult[],
});
const initialSnapshot = ref('');
const labelCreateError = ref<string | null>(null);
const formError = ref<string | null>(null);
const krEditorOpen = ref(false);
const editingKrIndex = ref<number | null>(null);
const krAdvancedOpen = ref(false);
const krFormError = ref<string | null>(null);
const calculationMethods = Object.values(KeyResultCalculationMethod);
const krForm = reactive({
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

const canSaveKeyResult = computed(
  () =>
    krForm.title.trim().length > 0 &&
    krForm.targetValue !== '' &&
    Number.isFinite(Number(krForm.initialValue)) &&
    Number.isFinite(Number(krForm.currentValue)) &&
    Number.isFinite(Number(krForm.targetValue)),
);

const goalStatusLabel = computed(() => {
  const status = props.mode === 'edit' && props.goal ? props.goal.status : 'Planned';
  const labels: Record<string, string> = {
    Planned: t('goal.list.statusPlanned'),
    InProgress: t('goal.list.statusInProgress'),
    Completed: t('goal.list.statusCompleted'),
    Abandoned: t('goal.list.statusAbandoned'),
  };
  return labels[status] ?? status;
});
const startChipLabel = computed(() =>
  draft.startDate
    ? `${t('goal.dialog.startDate')}: ${draft.startDate}`
    : t('goal.dialog.startDate'),
);

function snapshotDraft(): string {
  return JSON.stringify(draft);
}
function mapKeyResult(goalKr: NonNullable<GoalClientDTO['keyResults']>[number]): DraftKeyResult {
  return {
    id: goalKr.id,
    title: goalKr.title,
    description: goalKr.description,
    calculationMethod: goalKr.progress.aggregationMethod,
    initialValue: goalKr.progress.initialValue,
    currentValue: goalKr.progress.currentValue,
    targetValue: goalKr.progress.targetValue,
    target: goalKr.target,
    unit: goalKr.progress.unit,
    weight: goalKr.weight,
  };
}
function reset(): void {
  draft.name = props.goal?.name ?? '';
  draft.summary = props.goal?.summary ?? '';
  draft.startDate = toProductYmdInputValue(props.goal?.startDate);
  draft.target = props.goal?.target ? { ...props.goal.target } : null;
  draft.reminderConfig = props.goal?.reminderConfig
    ? {
        enabled: props.goal.reminderConfig.enabled,
        triggers: props.goal.reminderConfig.triggers.map((trigger) => ({ ...trigger })),
      }
    : null;
  draft.labelIds = props.goal?.labels.map((label) => label.id) ?? [];
  draft.keyResults = props.goal?.keyResults?.map(mapKeyResult) ?? [];
  labelCreateError.value = null;
  formError.value = null;
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
  krForm.description = '';
  krForm.initialValue = 0;
  krForm.currentValue = 0;
  krForm.targetValue = '';
  krForm.target = null;
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
  krForm.description = keyResult.description ?? '';
  krForm.initialValue = keyResult.initialValue;
  krForm.currentValue = keyResult.currentValue ?? keyResult.initialValue;
  krForm.targetValue = keyResult.targetValue;
  krForm.target = keyResult.target ? { ...keyResult.target } : null;
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
  const initial = Number(krForm.initialValue);
  const current = Number(krForm.currentValue);
  const target = Number(krForm.targetValue);
  if (![initial, current, target].every(Number.isFinite)) {
    krFormError.value = t('common.operationFailed');
    return false;
  }
  if (initial === target) {
    krFormError.value = t('goal.dialog.krInitialTargetConflict');
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
    description: krForm.description.trim() || null,
    calculationMethod: krForm.calculationMethod,
    initialValue: Number(krForm.initialValue),
    currentValue: current,
    targetValue: Number(krForm.targetValue),
    target: krForm.target,
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

function validateReminderConfig(): boolean {
  formError.value = null;
  const config = draft.reminderConfig;
  if (!config?.enabled) return true;
  for (const trigger of config.triggers.filter((item) => item.enabled)) {
    if (trigger.type === ReminderTriggerType.RemainingDays && !draft.target) {
      formError.value = t('goal.dialog.reminderRemainingDaysRequiresTargetDate');
      return false;
    }
    if (
      trigger.type === ReminderTriggerType.TimeProgressPercentage &&
      (!draft.startDate || !draft.target)
    ) {
      formError.value = t('goal.dialog.reminderTimeProgressRequiresRange');
      return false;
    }
  }
  return true;
}

async function save(): Promise<void> {
  if (!draft.name.trim() || krEditorOpen.value || !validateReminderConfig()) return;
  const labelIds = [...draft.labelIds];
  const keyResults = draft.keyResults.map((item) => ({ ...item }));
  const startDate = fromProductYmdInputValue(draft.startDate);
  const common = {
    name: draft.name.trim(),
    summary: draft.summary.trim() || undefined,
    startDate: startDate ?? undefined,
    target: draft.target ?? undefined,
    labelIds,
  };

  if (props.mode === 'edit' && props.goal) {
    const req: UpdateGoalReq = {
      expectedVersion: props.goal.version,
      ...common,
      summary: common.summary ?? null,
      startDate: common.startDate ?? null,
      target: common.target ?? null,
      reminderConfig: draft.reminderConfig,
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
    ...(draft.reminderConfig ? { reminderConfig: draft.reminderConfig } : {}),
    initialKeyResults: keyResults.map(({ id: _id, ...item }) => item),
  };
  const saved = await createGoal(req);
  if (saved) {
    emit('created', saved);
    setOpen(false);
  }
}
</script>
