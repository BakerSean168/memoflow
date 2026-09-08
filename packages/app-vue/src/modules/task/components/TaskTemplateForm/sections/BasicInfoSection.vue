<!-- widgets/BasicInfoSection.vue -->
<template>
  <section class="space-y-4" aria-labelledby="task-basic-info-heading">
    <header>
      <h3 id="task-basic-info-heading" class="flex items-center text-sm font-semibold">
        <Info class="mr-2 h-5 w-5" />
        {{ t('task.basicInfo.title') }}
      </h3>
    </header>
    <div>
      <Alert v-if="showValidationErrors" variant="destructive" class="mb-4">
        <AlertDescription>
          <ul class="mb-0 list-disc pl-4">
            <li v-for="(error, key) in validationErrors" :key="key">{{ error }}</li>
          </ul>
        </AlertDescription>
      </Alert>
      <div class="grid grid-cols-12 gap-4">
        <div class="col-span-12">
          <Label for="task-template-title">{{ t('task.basicInfo.taskTitle') }}</Label>
          <Input
            id="task-template-title"
            v-model="title"
            data-testid="task-template-title-input"
            :placeholder="t('task.basicInfo.titlePlaceholderRequired')"
            maxlength="100"
            class="mt-1"
            @blur="hasInteracted = true"
          />
        </div>

        <div class="col-span-12">
          <Label for="task-template-description">{{ t('task.basicInfo.description') }}</Label>
          <Textarea
            id="task-template-description"
            v-model="description"
            data-testid="task-template-description-input"
            :placeholder="t('task.basicInfo.descPlaceholder')"
            :rows="3"
            maxlength="1000"
            class="mt-1 resize-none"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, AlertDescription, Input, Textarea, Label } from '@memoflow/ui-vue-shadcn';
import { Info } from '@lucide/vue';
import { useBasicInfoValidation } from '../../../composables/useBasicInfoValidation';
import type { TaskTemplateViewModel } from '../../types';

const { t } = useI18n();

const props = defineProps<{
  modelValue: TaskTemplateViewModel;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: TaskTemplateViewModel];
  'update:validation': [isValid: boolean];
}>();

const { validate, validationErrors, isValid } = useBasicInfoValidation();
const hasInteracted = ref(false);

const updateTemplate = (updater: (template: TaskTemplateViewModel) => void) => {
  const updatedTemplate: TaskTemplateViewModel = {
    ...props.modelValue,
    timeConfig: { ...(props.modelValue.timeConfig || {}) },
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
    updateTemplate((template) => {
      template.title = value;
    });
  },
});

const description = computed({
  get: () => props.modelValue.description,
  set: (value: string) => {
    updateTemplate((template) => {
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
