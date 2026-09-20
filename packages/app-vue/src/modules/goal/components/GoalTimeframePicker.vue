<template>
  <ProductTimeframePicker
    :model-value="modelValue"
    :disabled="disabled"
    :test-id="testId"
    :aria-label="ariaLabel"
    :placeholder="placeholder"
    :label="t('goal.dialog.target')"
    :input-placeholder="t('common.productDateInputPlaceholder')"
    :precision-hint="t('goal.dialog.targetPrecisionHint')"
    :invalid-text="t('common.productDateInputInvalid')"
    :day-label="t('goal.dialog.targetDay')"
    :month-label="t('goal.dialog.targetMonth')"
    :quarter-label="t('goal.dialog.targetQuarter')"
    :half-year-label="t('goal.dialog.targetHalfYear')"
    :year-label="t('goal.dialog.targetYear')"
    :clear-label="t('common.clear')"
    :locale="locale"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { GoalTimeframe } from '@memoflow/contracts/goal';
import { ProductTimeframePicker } from '../../../shared/components';

withDefaults(
  defineProps<{
    modelValue: GoalTimeframe | null;
    disabled?: boolean;
    testId?: string;
    ariaLabel?: string;
    placeholder?: string;
  }>(),
  {
    disabled: false,
    testId: 'goal-target-chip',
    ariaLabel: 'Target timeframe',
    placeholder: '',
  },
);
const emit = defineEmits<{ 'update:modelValue': [GoalTimeframe | null] }>();
const { t, locale } = useI18n();
</script>
