<template>
  <div aria-labelledby="task-basic-info-heading">
    <h3 id="task-basic-info-heading" class="sr-only">{{ t('task.basicInfo.title') }}</h3>

    <Transition
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <p
        v-if="showValidationErrors"
        class="mb-1 text-xs text-destructive"
        role="alert"
        data-testid="task-title-validation-error"
      >
        {{ Object.values(validationErrors)[0] }}
      </p>
    </Transition>

    <Label for="task-plan-title" class="sr-only">{{ t('task.basicInfo.taskTitle') }}</Label>
    <ProductAutoTextarea
      id="task-plan-title"
      v-model="title"
      :max-length="100"
      :rows="1"
      data-testid="task-plan-title-input"
      class="min-h-10 text-xl font-semibold leading-tight text-foreground sm:text-2xl"
      :placeholder="t('task.basicInfo.titlePlaceholderRequired')"
      @blur="hasInteracted = true"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Label } from '@memoflow/ui-vue-shadcn';
import { ProductAutoTextarea } from '../../../../../shared/components';
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

const title = computed({
  get: () => props.modelValue.title,
  set: (value: string) => {
    emit('update:modelValue', {
      ...props.modelValue,
      title: value,
    });
  },
});

const showValidationErrors = computed(
  () => hasInteracted.value && Object.keys(validationErrors.value).length > 0,
);

watch(
  title,
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
