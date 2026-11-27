<script setup lang="ts">
import { ref } from 'vue';
import type { Hm } from '@memoflow/shared-primitives';
import { SegmentedTimeInput } from '@memoflow/ui-vue-shadcn';
import { getProductTime } from '../utils/product-time';

const props = withDefaults(
  defineProps<{
    modelValue: Hm | string;
    label?: string;
    hourLabel?: string;
    minuteLabel?: string;
    disabled?: boolean;
    testId?: string;
  }>(),
  {
    label: 'Time',
    hourLabel: 'Hour',
    minuteLabel: 'Minute',
    disabled: false,
    testId: 'product-time-picker',
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: Hm] }>();

const timeInputRef = ref<InstanceType<typeof SegmentedTimeInput> | null>(null);

function handleCommit(raw: string): void {
  if (props.disabled) return;
  const value = getProductTime().codec.parseHm(raw);
  if (value && value !== props.modelValue) {
    emit('update:modelValue', value);
  }
}

defineExpose({
  commitDraft: () => timeInputRef.value?.commitDraft() ?? null,
  focus: () => timeInputRef.value?.focus('hour'),
});
</script>

<template>
  <SegmentedTimeInput
    ref="timeInputRef"
    :model-value="modelValue"
    :label="label"
    :hour-label="hourLabel"
    :minute-label="minuteLabel"
    :disabled="disabled"
    :test-id="testId"
    @update:model-value="handleCommit"
  />
</template>
