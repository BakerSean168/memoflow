<template>
  <div aria-labelledby="task-basic-info-heading">
    <h3 id="task-basic-info-heading" class="sr-only">{{ t('task.basicInfo.title') }}</h3>

    <Label for="task-plan-title" class="sr-only">{{ t('task.basicInfo.taskTitle') }}</Label>
    <ProductAutoTextarea
      id="task-plan-title"
      v-model="title"
      :disabled="readonly"
      :max-length="100"
      :rows="1"
      aria-required="true"
      data-testid="task-plan-title-input"
      class="min-h-10 text-xl font-semibold leading-tight text-foreground sm:text-2xl"
      :placeholder="t('task.basicInfo.titlePlaceholderRequired')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Label } from '@memoflow/ui-vue-shadcn';
import { useBasicInfoValidation } from '../../../composables/useBasicInfoValidation';
import type { TaskPlanViewModel } from '../../types';
import { taskUiHost } from '../../../task-ui-host';
const ProductAutoTextarea = taskUiHost.components['ProductAutoTextarea'];

const { t } = useI18n();

const props = defineProps<{
  modelValue: TaskPlanViewModel;
  readonly?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: TaskPlanViewModel];
  'update:validation': [isValid: boolean];
}>();

const { validate, isValid } = useBasicInfoValidation();

const title = computed({
  get: () => props.modelValue.title,
  set: (value: string) => {
    if (props.readonly) return;
    emit('update:modelValue', {
      ...props.modelValue,
      title: value,
    });
  },
});

watch(
  title,
  () => {
    validate(title.value, t('task.basicInfo.titleRequired'));
    emit('update:validation', isValid.value);
  },
  { immediate: true },
);
</script>
