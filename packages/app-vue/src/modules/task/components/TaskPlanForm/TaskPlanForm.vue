<template>
  <div class="task-plan-form-container flex min-h-0 flex-1 flex-col">
    <div
      v-if="!taskPlanBeingEdited"
      class="mb-4 flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive"
    >
      <AlertCircle class="mt-0.5 h-5 w-5 shrink-0" />
      <div class="flex-1">
        <p class="font-semibold">{{ t('task.templateForm.loadError') }}</p>
        <p class="text-sm">{{ t('task.templateForm.notFoundMessage') }}</p>
      </div>
      <Button variant="ghost" size="sm" @click="handleClose">{{
        t('task.templateForm.close')
      }}</Button>
    </div>

    <form
      v-else
      ref="formRef"
      class="task-plan-form flex min-h-0 flex-1 flex-col gap-6"
      @submit.prevent
    >
      <section
        class="space-y-4 border-b border-border/70 pb-5"
        data-testid="task-plan-identity-section"
      >
        <BasicInfoSection
          :model-value="taskPlanBeingEdited"
          @update:validation="updateBasicValidation"
          @update:model-value="handlePlanUpdate"
        />

        <div
          class="flex flex-wrap items-center gap-2"
          data-testid="task-plan-property-chips"
          :aria-label="t('task.metadata.title')"
        >
          <Popover
            :open="activeProperty === 'schedule'"
            @update:open="setPropertyOpen('schedule', $event)"
          >
            <PopoverTrigger as-child>
              <ProductPropertyChip
                data-testid="task-schedule-chip"
                :active="activeProperty === 'schedule'"
                :disabled="props.readonly"
              >
                <template #icon><CalendarClock class="h-3.5 w-3.5" /></template>
                {{ scheduleChipLabel }}
              </ProductPropertyChip>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              class="max-h-[70vh] w-[440px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border-border/80 p-3 shadow-xl"
              data-testid="task-schedule-popover"
            >
              <TimeConfigSection
                :model-value="taskPlanBeingEdited"
                :is-edit-mode="isEditMode"
                @update:validation="updateTimeValidation"
                @update:model-value="handlePlanUpdate"
              />
            </PopoverContent>
          </Popover>

          <Popover
            :open="activeProperty === 'recurrence'"
            @update:open="setPropertyOpen('recurrence', $event)"
          >
            <PopoverTrigger as-child>
              <ProductPropertyChip
                data-testid="task-recurrence-chip"
                :active="activeProperty === 'recurrence'"
                :disabled="props.readonly"
              >
                <template #icon><Repeat2 class="h-3.5 w-3.5" /></template>
                {{ recurrenceChipLabel }}
              </ProductPropertyChip>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              class="max-h-[70vh] w-[460px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border-border/80 p-3 shadow-xl"
              data-testid="task-recurrence-popover"
            >
              <RecurrenceSection
                :model-value="taskPlanBeingEdited"
                @update:validation="updateRecurrenceValidation"
                @update:model-value="handlePlanUpdate"
              />
            </PopoverContent>
          </Popover>

          <Popover :open="activeProperty === 'goal'" @update:open="setPropertyOpen('goal', $event)">
            <PopoverTrigger as-child>
              <ProductPropertyChip
                data-testid="task-goal-chip"
                :active="activeProperty === 'goal'"
                :disabled="props.readonly"
              >
                <template #icon><Target class="h-3.5 w-3.5" /></template>
                {{ goalChipLabel }}
              </ProductPropertyChip>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              class="max-h-[70vh] w-[500px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border-border/80 p-3 shadow-xl"
              data-testid="task-goal-popover"
            >
              <KeyResultLinksSection
                :model-value="taskPlanBeingEdited"
                :goals="goals"
                :key-results-by-goal="keyResultsByGoal"
                :loading-goals="props.loadingGoals"
                :loading-key-results="props.loadingKeyResults"
                :key-result-errors-by-goal="props.keyResultErrorsByGoal"
                :on-request-key-results="props.onRequestKeyResults"
                @update:validation="updateGoalBindingValidation"
                @update:model-value="handlePlanUpdate"
              />
            </PopoverContent>
          </Popover>

          <Popover
            :open="activeProperty === 'reminder'"
            @update:open="setPropertyOpen('reminder', $event)"
          >
            <PopoverTrigger as-child>
              <ProductPropertyChip
                data-testid="task-reminder-chip"
                :active="activeProperty === 'reminder'"
                :disabled="props.readonly"
              >
                <template #icon><Bell class="h-3.5 w-3.5" /></template>
                {{ reminderChipLabel }}
              </ProductPropertyChip>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              class="max-h-[70vh] w-[560px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border-border/80 p-3 shadow-xl"
              data-testid="task-reminder-popover"
            >
              <ReminderSection
                :model-value="taskPlanBeingEdited"
                @update:validation="updateReminderValidation"
                @update:model-value="handlePlanUpdate"
              />
            </PopoverContent>
          </Popover>

          <Popover
            :open="activeProperty === 'importance'"
            @update:open="setPropertyOpen('importance', $event)"
          >
            <PopoverTrigger as-child>
              <ProductPropertyChip
                data-testid="task-importance-chip"
                :active="activeProperty === 'importance'"
                :disabled="props.readonly"
              >
                <template #icon><Flag class="h-3.5 w-3.5" /></template>
                {{ importanceChipLabel }}
              </ProductPropertyChip>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              class="w-60 rounded-xl border-border/80 p-1.5 shadow-xl"
              data-testid="task-importance-popover"
            >
              <div class="px-2 py-1.5 text-xs text-muted-foreground">
                {{ t('task.metadata.selectImportance') }}
              </div>
              <Button
                v-for="option in importanceOptions"
                :key="option.value"
                type="button"
                variant="ghost"
                class="h-9 w-full justify-start gap-2 rounded-md px-2 font-normal"
                :class="
                  taskPlanBeingEdited.importance === option.value
                    ? 'bg-accent text-accent-foreground'
                    : ''
                "
                :data-testid="`task-importance-option-${option.value}`"
                @click="setImportance(option.value)"
              >
                <component :is="option.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
                <span class="min-w-0 flex-1 text-left">{{ option.title }}</span>
                <Check
                  class="h-4 w-4 shrink-0"
                  :class="
                    taskPlanBeingEdited.importance === option.value ? 'opacity-100' : 'opacity-0'
                  "
                />
              </Button>
            </PopoverContent>
          </Popover>

          <LabelPicker
            :model-value="labelIds"
            :options="labelOptions"
            :disabled="labelsLoading || props.readonly"
            :placeholder="t('task.metadata.labelsPlaceholder')"
            :search-placeholder="t('task.metadata.searchLabels')"
            :empty-text="t('task.metadata.noLabels')"
            :create-label="t('task.metadata.createLabel')"
            :aria-label="t('task.metadata.labels')"
            compact
            @update:model-value="updateLabelIds"
            @create="createAndSelectLabel"
          />
        </div>

        <p v-if="labelCreateError" role="alert" class="text-xs text-destructive">
          {{ labelCreateError }}
        </p>
      </section>

      <section class="space-y-2" data-testid="task-description-section">
        <Label for="task-plan-description" class="sr-only">{{
          t('task.basicInfo.description')
        }}</Label>
        <ProductAutoTextarea
          id="task-plan-description"
          :model-value="taskPlanBeingEdited.description ?? ''"
          :max-length="2000"
          :rows="5"
          data-testid="task-plan-description-input"
          class="min-h-32 text-sm leading-6 text-foreground/90"
          :placeholder="t('task.basicInfo.descPlaceholder')"
          @update:model-value="updateDescription"
        />
      </section>

      <ChecklistSection
        class="mt-auto shrink-0"
        :model-value="taskPlanBeingEdited"
        :disabled="props.readonly"
        @update:validation="updateMetadataValidation"
        @update:model-value="handlePlanUpdate"
      />
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bell,
  CalendarClock,
  Check,
  ChevronsDown,
  ChevronsUp,
  Flag,
  Minus,
  Repeat2,
  Target,
} from '@lucide/vue';
import { Button, Label, Popover, PopoverContent, PopoverTrigger } from '@memoflow/ui-vue-shadcn';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import {
  LabelPicker,
  ProductAutoTextarea,
  ProductPropertyChip,
} from '../../../../shared/components';
import { useLabelCatalog } from '../../../../shared/composables/useLabelCatalog';
import BasicInfoSection from './sections/BasicInfoSection.vue';
import TimeConfigSection from './sections/TimeConfigSection.vue';
import RecurrenceSection from './sections/RecurrenceSection.vue';
import ReminderSection from './sections/ReminderSection.vue';
import KeyResultLinksSection from './sections/KeyResultLinksSection.vue';
import ChecklistSection from './sections/ChecklistSection.vue';
import { useTaskPlanForm } from '../../composables/useTaskPlanForm';
import type { TaskPlanFormEmits, TaskPlanFormProps, TaskPlanViewModel } from '../types';
import { getTaskPlanScheduleTimeDisplay } from '../../utils/task-plan-presentation';

const { t } = useI18n();
const props = withDefaults(defineProps<TaskPlanFormProps>(), {
  modelValue: null,
  isEditMode: false,
  readonly: false,
});
const emit = defineEmits<TaskPlanFormEmits>();
const formRef = ref();
type PropertyEditor = 'schedule' | 'recurrence' | 'goal' | 'reminder' | 'importance';
const activeProperty = ref<PropertyEditor | null>(null);
const labelCreateError = ref<string | null>(null);

const {
  isFormValid,
  validateForm,
  updateBasicValidation,
  updateTimeValidation,
  updateRecurrenceValidation,
  updateReminderValidation,
  updateGoalBindingValidation,
  updateMetadataValidation,
} = useTaskPlanForm();
const {
  labels: labelCatalog,
  options: labelOptions,
  isLoading: labelsLoading,
  createLabel,
} = useLabelCatalog();

const taskPlanBeingEdited = computed(() => props.modelValue);
const goals = computed(() => props.goals ?? []);
const keyResultsByGoal = computed(() => props.keyResultsByGoal ?? {});
const labelIds = computed(
  () =>
    taskPlanBeingEdited.value?.labelIds ??
    taskPlanBeingEdited.value?.labels?.map((label) => label.id) ??
    [],
);

const scheduleChipLabel = computed(() => {
  const schedule = taskPlanBeingEdited.value?.schedule;
  if (!schedule) return t('task.timeConfig.title');
  const date = schedule.kind === 'OneTime' ? schedule.date : schedule.startDate;
  return `${date} · ${getTaskPlanScheduleTimeDisplay(t, schedule)}`;
});
const recurrenceChipLabel = computed(() =>
  taskPlanBeingEdited.value?.schedule.kind === 'Recurring'
    ? t('task.recurrence.title')
    : t('task.templateCard.noRecurrence'),
);
const goalChipLabel = computed(() =>
  taskPlanBeingEdited.value?.goalBinding ? t('task.krLinks.linkedCount') : t('task.krLinks.title'),
);
const reminderChipLabel = computed(() => {
  const config = taskPlanBeingEdited.value?.reminderConfig as
    { enabled?: boolean; triggers?: unknown[] } | null | undefined;
  const count = config?.enabled ? (config.triggers?.length ?? 0) : 0;
  return count > 0
    ? `${t('task.reminderSection.title')} · ${count}`
    : t('task.reminderSection.title');
});
const importanceOptions = computed(() => [
  {
    title: t('task.metadata.importanceCritical'),
    value: ImportanceLevel.Vital,
    icon: ChevronsUp,
  },
  {
    title: t('task.metadata.importanceHigh'),
    value: ImportanceLevel.Important,
    icon: ArrowUp,
  },
  {
    title: t('task.metadata.importanceMedium'),
    value: ImportanceLevel.Moderate,
    icon: Minus,
  },
  {
    title: t('task.metadata.importanceLow'),
    value: ImportanceLevel.Minor,
    icon: ArrowDown,
  },
  {
    title: t('task.metadata.importanceMinimal'),
    value: ImportanceLevel.Trivial,
    icon: ChevronsDown,
  },
]);
const importanceChipLabel = computed(
  () =>
    importanceOptions.value.find((option) => option.value === taskPlanBeingEdited.value?.importance)
      ?.title ?? t('task.metadata.importance'),
);

function setPropertyOpen(property: PropertyEditor, open: boolean): void {
  if (props.readonly) return;
  if (open) {
    activeProperty.value = property;
  } else if (activeProperty.value === property) {
    activeProperty.value = null;
  }
}

function handlePlanUpdate(updatedPlan: TaskPlanViewModel): void {
  emit('update:modelValue', updatedPlan);
}

function updateDescription(value: string): void {
  if (!taskPlanBeingEdited.value) return;
  handlePlanUpdate({
    ...taskPlanBeingEdited.value,
    description: value,
  });
}

function setImportance(value: ImportanceLevel): void {
  if (!taskPlanBeingEdited.value) return;
  handlePlanUpdate({
    ...taskPlanBeingEdited.value,
    importance: value,
  });
  activeProperty.value = null;
}

function updateLabelIds(ids: string[]): void {
  if (!taskPlanBeingEdited.value) return;
  const selected = new Set(ids);
  handlePlanUpdate({
    ...taskPlanBeingEdited.value,
    labelIds: [...ids],
    labels: labelCatalog.value.filter((label) => selected.has(label.id)),
  });
}

async function createAndSelectLabel(name: string): Promise<void> {
  labelCreateError.value = null;
  try {
    const label = await createLabel(name);
    updateLabelIds([...new Set([...labelIds.value, label.id])]);
  } catch (error) {
    labelCreateError.value =
      error instanceof Error ? error.message : t('task.metadata.labelCreateFailed');
  }
}

function handleClose(): void {
  emit('close');
}

watch(isFormValid, (newValue) => emit('update:validation', { isValid: newValue }), {
  immediate: true,
});

defineExpose({ validate: validateForm, isValid: isFormValid, formRef });
</script>
