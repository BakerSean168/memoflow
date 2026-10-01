<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Hm } from '@memoflow/contracts/primitives';
import { Input } from '@memoflow/ui-vue-shadcn';
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
const hour = ref('');
const minute = ref('');

watch(
  () => props.modelValue,
  (value) => {
    hour.value = value.slice(0, 2);
    minute.value = value.slice(3, 5);
  },
  { immediate: true },
);

function clockPart(value: string, max: number): number | null {
  if (!/^\d{1,2}$/.test(value) || Number(value) > max) return null;
  return Number(value);
}
const validHour = computed(() => clockPart(hour.value, 23));
const validMinute = computed(() => clockPart(minute.value, 59));

function commit(): void {
  if (props.disabled || validHour.value == null || validMinute.value == null) return;
  const value = getProductTime().codec.parseHm(
    `${String(validHour.value).padStart(2, '0')}:${String(validMinute.value).padStart(2, '0')}`,
  );
  if (value && value !== props.modelValue) emit('update:modelValue', value);
}

function committedPart(part: 'hour' | 'minute'): string {
  return part === 'hour' ? props.modelValue.slice(0, 2) : props.modelValue.slice(3, 5);
}

function normalize(part: 'hour' | 'minute'): void {
  const draft = part === 'hour' ? hour : minute;
  const value = part === 'hour' ? validHour.value : validMinute.value;
  draft.value = value == null ? committedPart(part) : String(value).padStart(2, '0');
}

function step(part: 'hour' | 'minute', delta: number): void {
  if (props.disabled) return;
  const draft = part === 'hour' ? hour : minute;
  const value = part === 'hour' ? validHour.value : validMinute.value;
  const range = part === 'hour' ? 24 : 60;
  draft.value = String(((value ?? Number(committedPart(part))) + delta + range) % range).padStart(
    2,
    '0',
  );
  commit();
}
</script>

<template>
  <div class="flex items-center gap-1.5" role="group" :aria-label="label" :data-testid="testId">
    <Input
      v-model="hour"
      type="text"
      inputmode="numeric"
      maxlength="2"
      class="h-8 w-11 px-1 text-center tabular-nums"
      :aria-label="hourLabel"
      :aria-invalid="validHour == null"
      :disabled="disabled"
      :data-testid="`${testId}-hour`"
      @update:model-value="commit"
      @blur="normalize('hour')"
      @keydown.up.prevent="step('hour', 1)"
      @keydown.down.prevent="step('hour', -1)"
    />
    <span aria-hidden="true">:</span>
    <Input
      v-model="minute"
      type="text"
      inputmode="numeric"
      maxlength="2"
      class="h-8 w-11 px-1 text-center tabular-nums"
      :aria-label="minuteLabel"
      :aria-invalid="validMinute == null"
      :disabled="disabled"
      :data-testid="`${testId}-minute`"
      @update:model-value="commit"
      @blur="normalize('minute')"
      @keydown.up.prevent="step('minute', 1)"
      @keydown.down.prevent="step('minute', -1)"
    />
  </div>
</template>
