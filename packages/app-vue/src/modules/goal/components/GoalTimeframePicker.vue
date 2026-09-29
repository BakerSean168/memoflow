<template>
  <ProductTimeframePicker
    :model-value="modelValue"
    :disabled="disabled"
    :test-id="testId"
    :aria-label="ariaLabel"
    :placeholder="placeholder"
    :label="label || t('goal.dialog.target')"
    :input-placeholder="t('goal.dialog.timeframeInputPlaceholder')"
    :precision-hint="t('goal.dialog.targetPrecisionHint')"
    :invalid-text="t('common.productDateInputInvalid')"
    :day-label="t('goal.dialog.targetDay')"
    :month-label="t('goal.dialog.targetMonth')"
    :quarter-label="t('goal.dialog.targetQuarter')"
    :half-year-label="t('goal.dialog.targetHalfYear')"
    :year-label="t('goal.dialog.targetYear')"
    :clear-label="t('common.clear')"
    :return-to-selected-label="t('goal.dialog.returnToToday')"
    :constraint-text="constraintText"
    :min-end-boundary="minEndBoundary"
    :max-start-boundary="maxStartBoundary"
    :locale="locale"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { GoalTimeframe } from '@memoflow/contracts/goal';
import type { Ymd } from '@memoflow/contracts/primitives';
import { ProductTimeframePicker } from '../../../shared/components';

withDefaults(
  defineProps<{
    modelValue: GoalTimeframe | null;
    disabled?: boolean;
    testId?: string;
    ariaLabel?: string;
    placeholder?: string;
    label?: string;
    constraintText?: string;
    minEndBoundary?: Ymd;
    maxStartBoundary?: Ymd;
  }>(),
  {
    disabled: false,
    testId: 'goal-target-chip',
    ariaLabel: 'Target timeframe',
    placeholder: '',
    label: '',
    constraintText: '',
    minEndBoundary: undefined,
    maxStartBoundary: undefined,
  },
);
const emit = defineEmits<{ 'update:modelValue': [GoalTimeframe | null] }>();
const { t, locale } = useI18n();
</script>
