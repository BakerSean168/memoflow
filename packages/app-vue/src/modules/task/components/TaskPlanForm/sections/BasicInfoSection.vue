<template>
  <section class="border-b pb-4" aria-labelledby="task-basic-info-heading">
    <h3 id="task-basic-info-heading" class="sr-only">{{ t('task.basicInfo.title') }}</h3>

    <Alert v-if="showValidationErrors" variant="destructive" class="mb-3">
      <AlertDescription>
        <ul class="mb-0 list-disc pl-4">
          <li v-for="(error, key) in validationErrors" :key="key">{{ error }}</li>
        </ul>
      </AlertDescription>
    </Alert>

    <Label for="task-plan-title" class="sr-only">{{ t('task.basicInfo.taskTitle') }}</Label>
    <Input
      id="task-plan-title"
      v-model="title"
      data-testid="task-plan-title-input"
      :placeholder="t('task.basicInfo.titlePlaceholderRequired')"
      maxlength="100"
      class="h-11 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring/30"
      @blur="hasInteracted = true"
    />

    <Label for="task-plan-description" class="sr-only">{{ t('task.basicInfo.description') }}</Label>
    <Textarea
      id="task-plan-description"
      v-model="description"
      data-testid="task-plan-description-input"
      :placeholder="t('task.basicInfo.descPlaceholder')"
      :rows="2"
      maxlength="1000"
      class="min-h-12 resize-none border-0 bg-transparent px-0 py-1 text-sm text-muted-foreground shadow-none focus-visible:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, AlertDescription, Input, Textarea, Label } from '@memoflow/ui-vue-shadcn';
import { useBasicInfoValidation } from '../../../composables/useBasicInfoValidation';
import type { TaskPlanViewModel } from '../../types';

const { t } = useI18n();

const props = defineProps<{
  modelValue: TaskPlanViewModel;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: TaskPlanViewModel];
  'update:validation': [isValid: boolean];
}>();

const { validate, validationErrors, isValid } = useBasicInfoValidation();
const hasInteracted = ref(false);

const updatePlan = (updater: (template: TaskPlanViewModel) => void) => {
  const updatedTemplate: TaskPlanViewModel = {
    ...props.modelValue,
    labels: [...(props.modelValue.labels ?? [])],
    labelIds: [...(props.modelValue.labelIds ?? [])],
    goalBinding: props.modelValue.goalBinding ? { ...props.modelValue.goalBinding } : null,
  };
  updater(updatedTemplate);
  emit('update:modelValue', updatedTemplate);
};

const title = computed({
  get: () => props.modelValue.title,
  set: (value: string) => {
    updatePlan((template) => {
      template.title = value;
    });
  },
});

const description = computed({
  get: () => props.modelValue.description,
  set: (value: string) => {
    updatePlan((template) => {
      template.description = value || '';
    });
  },
});

const showValidationErrors = computed(
  () => hasInteracted.value && Object.keys(validationErrors.value).length > 0,
);

watch(
  [title, description],
  () => {
    validate(title.value, t('task.basicInfo.titleRequired'));
    emit('update:validation', isValid.value);
  },
  { immediate: true },
);

watch(
  () => props.modelValue.id,
  () => {
    hasInteracted.value = false;
  },
  { immediate: true },
);
</script>
