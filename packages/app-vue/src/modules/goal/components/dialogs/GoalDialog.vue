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
      <template #actions>
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
      </template>

      <form id="goal-form" class="space-y-6" @submit.prevent="save">
        <section
          class="space-y-4 border-b border-border/70 pb-5"
          data-testid="goal-identity-section"
        >
          <div>
            <Label for="goal-name" class="sr-only">{{ t('goal.dialog.goalTitle') }}</Label>
            <ProductAutoTextarea
              id="goal-name"
              v-model="draft.name"
              :max-length="80"
              :rows="1"
              data-testid="goal-name-input"
              class="min-h-10 text-xl font-semibold leading-tight text-foreground sm:text-2xl"
              :placeholder="t('goal.dialog.goalTitlePlaceholder')"
              @limit-exceeded="nameLimitFeedback.show()"
            />
            <Transition
              enter-active-class="transition-opacity duration-150"
              leave-active-class="transition-opacity duration-150"
              enter-from-class="opacity-0"
              leave-to-class="opacity-0"
            >
              <p
                v-if="nameLimitFeedback.visible.value"
                class="mt-1 text-xs text-destructive"
                role="alert"
                data-testid="goal-name-limit-error"
              >
                {{ t('goal.dialog.nameLimitExceeded') }}
              </p>
            </Transition>
          </div>

          <div>
            <Label for="goal-summary" class="sr-only">{{ t('goal.dialog.summary') }}</Label>
            <ProductAutoTextarea
              id="goal-summary"
              v-model="draft.summary"
              :max-length="255"
              :rows="1"
              data-testid="goal-summary-input"
              class="min-h-8 text-sm leading-5 text-muted-foreground"
              :placeholder="t('goal.dialog.summaryPlaceholder')"
              @limit-exceeded="summaryLimitFeedback.show()"
            />
            <Transition
              enter-active-class="transition-opacity duration-150"
              leave-active-class="transition-opacity duration-150"
              enter-from-class="opacity-0"
              leave-to-class="opacity-0"
            >
              <p
                v-if="summaryLimitFeedback.visible.value"
                class="mt-1 text-xs text-destructive"
                role="alert"
                data-testid="goal-summary-limit-error"
              >
                {{ t('goal.dialog.summaryLimitExceeded') }}
              </p>
            </Transition>
          </div>

          <div class="flex flex-wrap items-center gap-2" data-testid="goal-property-chips">
            <GoalStatusPicker
              v-model="draft.status"
              :base-status="persistedStatus"
              :disabled="isSaving"
            />
            <ProductDatePicker
              v-model="startDateModel"
              :label="t('goal.dialog.startDate')"
              :placeholder="t('goal.dialog.startDate')"
              :input-placeholder="t('common.productDateInputPlaceholder')"
              :format-hint="t('common.productDateInputHint')"
              :invalid-text="t('common.productDateInputInvalid')"
              :clear-label="t('common.clear')"
              test-id="goal-start-chip"
              :aria-label="t('goal.dialog.startDate')"
            />

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
                <ProductPropertyChip data-testid="goal-notes-chip">
                  <template #icon><NotebookText class="h-3.5 w-3.5" /></template>
                  {{ t('goal.dialog.notes') }}
                </ProductPropertyChip>
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
        </section>

        <section class="space-y-2" data-testid="goal-description-section">
          <Label for="goal-description" class="sr-only">{{ t('goal.dialog.description') }}</Label>
          <ProductAutoTextarea
            id="goal-description"
            v-model="draft.description"
            :max-length="10000"
            :rows="5"
            data-testid="goal-description-input"
            class="min-h-32 text-sm leading-6 text-foreground/90"
            :placeholder="t('goal.dialog.descriptionLongPlaceholder')"
            @limit-exceeded="descriptionLimitFeedback.show()"
          />
          <Transition
            enter-active-class="transition-opacity duration-150"
            leave-active-class="transition-opacity duration-150"
            enter-from-class="opacity-0"
            leave-to-class="opacity-0"
          >
            <p
              v-if="descriptionLimitFeedback.visible.value"
              class="text-xs text-destructive"
              role="alert"
              data-testid="goal-description-limit-error"
            >
              {{ t('goal.dialog.descriptionLimitExceeded') }}
            </p>
          </Transition>
        </section>

        <GoalKeyResultDraftEditor
          v-model="draft.keyResults"
          :disabled="isSaving"
          @editing-change="krEditorOpen = $event"
        />
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
import { NotebookText, Sparkles } from '@lucide/vue';
import {
  GoalStatus,
  ReminderTriggerType,
  type GoalStatus as GoalStatusValue,
  type GoalReminderConfigDTO,
  type GoalClientDTO,
  type GoalTimeframe,
  type CreateGoalReq,
  type UpdateGoalReq,
} from '@memoflow/contracts/goal';
import {
  Button,
  Dialog,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@memoflow/ui-vue-shadcn';
import {
  LabelPicker,
  ProductAutoTextarea,
  ProductDatePicker,
  ProductDialogShell,
  ProductPropertyChip,
} from '../../../../shared/components';
import GoalReminderChip from '../GoalReminderChip.vue';
import GoalTimeframePicker from '../GoalTimeframePicker.vue';
import GoalStatusPicker from '../GoalStatusPicker.vue';
import GoalKeyResultDraftEditor from '../GoalKeyResultDraftEditor.vue';
import {
  fromProductYmdInputValue,
  toProductYmdInputValue,
} from '../../../../shared/utils/product-time';
import { useLabelCatalog } from '../../../../shared/composables/useLabelCatalog';
import { useGoal } from '../../composables/useGoal';
import { useTransientFeedback } from '../../../../shared/composables/useTransientFeedback';

type DraftKeyResult = NonNullable<UpdateGoalReq['keyResults']>[number];

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
const { createGoal, updateGoal, transitionGoalStatus, isSaving } = useGoal();
const { options: labelOptions, isLoading: labelsLoading, createLabel } = useLabelCatalog();

const draft = reactive({
  name: '',
  summary: '',
  description: '',
  status: GoalStatus.Planned as GoalStatusValue,
  startDate: '',
  target: null as GoalTimeframe | null,
  reminderConfig: null as GoalReminderConfigDTO | null,
  labelIds: [] as string[],
  keyResults: [] as DraftKeyResult[],
});
const initialSnapshot = ref('');
const labelCreateError = ref<string | null>(null);
const formError = ref<string | null>(null);
const nameLimitFeedback = useTransientFeedback();
const summaryLimitFeedback = useTransientFeedback();
const descriptionLimitFeedback = useTransientFeedback();
const krEditorOpen = ref(false);
const persistedStatus = computed(() => props.goal?.status ?? GoalStatus.Planned);
const startDateModel = computed({
  get: () => fromProductYmdInputValue(draft.startDate) ?? null,
  set: (value) => {
    draft.startDate = value ?? '';
  },
});

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
  draft.description = props.goal?.description ?? '';
  draft.status = props.goal?.status ?? GoalStatus.Planned;
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
  nameLimitFeedback.hide();
  summaryLimitFeedback.hide();
  descriptionLimitFeedback.hide();
  krEditorOpen.value = false;
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
    description: draft.description.trim() || undefined,
    startDate: startDate ?? undefined,
    target: draft.target ?? undefined,
    labelIds,
  };

  if (props.mode === 'edit' && props.goal) {
    const req: UpdateGoalReq = {
      expectedVersion: props.goal.version,
      ...common,
      summary: common.summary ?? null,
      description: common.description ?? null,
      startDate: common.startDate ?? null,
      target: common.target ?? null,
      reminderConfig: draft.reminderConfig,
      keyResults,
    };
    const saved = await updateGoal(String(props.goal.id), req);
    if (!saved) return;
    const finalGoal = await transitionGoalStatus(saved, draft.status);
    if (!finalGoal) {
      emit('updated', saved);
      setOpen(false);
      return;
    }
    emit('updated', finalGoal);
    setOpen(false);
    return;
  }

  const req: CreateGoalReq = {
    ...common,
    ...(draft.reminderConfig ? { reminderConfig: draft.reminderConfig } : {}),
    initialKeyResults: keyResults.map(({ id: _id, ...item }) => item),
  };
  const saved = await createGoal(req);
  if (!saved) return;
  const finalGoal = await transitionGoalStatus(saved, draft.status);
  if (!finalGoal) {
    emit('created', saved);
    setOpen(false);
    return;
  }
  emit('created', finalGoal);
  setOpen(false);
}
</script>
