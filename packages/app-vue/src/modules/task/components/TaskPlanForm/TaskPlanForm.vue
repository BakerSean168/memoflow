<template>
  <div class="task-plan-form-container">
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

    <form v-else ref="formRef" class="task-plan-form space-y-5" @submit.prevent>
      <BasicInfoSection
        :model-value="taskPlanBeingEdited"
        @update:validation="updateBasicValidation"
        @update:model-value="handlePlanUpdate"
      />

      <div class="space-y-3">
        <div
          class="flex flex-wrap items-center gap-2"
          data-testid="task-plan-property-chips"
          aria-label="Task plan properties"
        >
          <ProductPropertyChip
            data-testid="task-schedule-chip"
            :active="activeProperty === 'schedule'"
            @click="toggleProperty('schedule')"
          >
            <template #icon><CalendarClock class="h-3.5 w-3.5" /></template>
            {{ scheduleChipLabel }}
          </ProductPropertyChip>

          <ProductPropertyChip
            data-testid="task-recurrence-chip"
            :active="activeProperty === 'recurrence'"
            @click="toggleProperty('recurrence')"
          >
            <template #icon><Repeat2 class="h-3.5 w-3.5" /></template>
            {{ recurrenceChipLabel }}
          </ProductPropertyChip>

          <ProductPropertyChip
            data-testid="task-goal-chip"
            :active="activeProperty === 'goal'"
            @click="toggleProperty('goal')"
          >
            <template #icon><Target class="h-3.5 w-3.5" /></template>
            {{ goalChipLabel }}
          </ProductPropertyChip>

          <ProductPropertyChip
            data-testid="task-reminder-chip"
            :active="activeProperty === 'reminder'"
            @click="toggleProperty('reminder')"
          >
            <template #icon><Bell class="h-3.5 w-3.5" /></template>
            {{ reminderChipLabel }}
          </ProductPropertyChip>

          <ProductPropertyChip
            data-testid="task-checklist-chip"
            :active="activeProperty === 'checklist'"
            @click="toggleProperty('checklist')"
          >
            <template #icon><ListChecks class="h-3.5 w-3.5" /></template>
            {{ checklistChipLabel }}
          </ProductPropertyChip>

          <ProductPropertyChip
            data-testid="task-properties-chip"
            :active="activeProperty === 'metadata'"
            @click="toggleProperty('metadata')"
          >
            <template #icon><SlidersHorizontal class="h-3.5 w-3.5" /></template>
            {{ metadataChipLabel }}
          </ProductPropertyChip>
        </div>

        <div
          v-if="activeProperty"
          class="rounded-xl border bg-muted/20 p-4"
          data-testid="task-plan-property-editor"
        >
          <TimeConfigSection
            v-if="activeProperty === 'schedule'"
            :model-value="taskPlanBeingEdited"
            :is-edit-mode="isEditMode"
            @update:validation="updateTimeValidation"
            @update:model-value="handlePlanUpdate"
          />

          <RecurrenceSection
            v-else-if="activeProperty === 'recurrence'"
            :model-value="taskPlanBeingEdited"
            @update:validation="updateRecurrenceValidation"
            @update:model-value="handlePlanUpdate"
          />

          <KeyResultLinksSection
            v-else-if="activeProperty === 'goal'"
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

          <ReminderSection
            v-else-if="activeProperty === 'reminder'"
            :model-value="taskPlanBeingEdited"
            @update:validation="updateReminderValidation"
            @update:model-value="handlePlanUpdate"
          />

          <ChecklistSection
            v-else-if="activeProperty === 'checklist'"
            :model-value="taskPlanBeingEdited"
            @update:validation="updateMetadataValidation"
            @update:model-value="handlePlanUpdate"
          />

          <MetadataSection
            v-else-if="activeProperty === 'metadata'"
            :model-value="taskPlanBeingEdited"
            @update:validation="updateMetadataValidation"
            @update:model-value="handlePlanUpdate"
          />
        </div>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AlertCircle,
  Bell,
  CalendarClock,
  ListChecks,
  Repeat2,
  SlidersHorizontal,
  Target,
} from '@lucide/vue';
import { Button } from '@memoflow/ui-vue-shadcn';
import { ProductPropertyChip } from '../../../../shared/components';
import BasicInfoSection from './sections/BasicInfoSection.vue';
import TimeConfigSection from './sections/TimeConfigSection.vue';
import RecurrenceSection from './sections/RecurrenceSection.vue';
import ReminderSection from './sections/ReminderSection.vue';
import MetadataSection from './sections/MetadataSection.vue';
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
type PropertyEditor = 'schedule' | 'recurrence' | 'goal' | 'reminder' | 'checklist' | 'metadata';
const activeProperty = ref<PropertyEditor | null>(null);

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

const taskPlanBeingEdited = computed(() => props.modelValue);
const goals = computed(() => props.goals ?? []);
const keyResultsByGoal = computed(() => props.keyResultsByGoal ?? {});
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
const checklistChipLabel = computed(() => {
  const count = taskPlanBeingEdited.value?.checklist.length ?? 0;
  return count > 0 ? `${t('task.checklist.title')} · ${count}` : t('task.checklist.title');
});
const metadataChipLabel = computed(
  () => taskPlanBeingEdited.value?.importanceText ?? t('task.metadata.title'),
);

function toggleProperty(property: PropertyEditor): void {
  activeProperty.value = activeProperty.value === property ? null : property;
}
function handlePlanUpdate(updatedPlan: TaskPlanViewModel): void {
  emit('update:modelValue', updatedPlan);
}
function handleClose(): void {
  emit('close');
}

watch(isFormValid, (newValue) => emit('update:validation', { isValid: newValue }), {
  immediate: true,
});

defineExpose({ validate: validateForm, isValid: isFormValid, formRef });
</script>
