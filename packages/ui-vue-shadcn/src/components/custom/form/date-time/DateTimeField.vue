<script setup lang="ts">
import type { Hm, Ymd } from '@memoflow/time';
import { computed, useId } from 'vue';
import { Label } from '../../../ui/label';
import { Switch } from '../../../ui/switch';
import DateField from './DateField.vue';
import TimeField from './TimeField.vue';
import type { DateTimeFieldValue } from './types';

const props = withDefaults(
  defineProps<{
    modelValue?: DateTimeFieldValue;
    id?: string;
    dateLabel?: string;
    timeLabel?: string;
    allDayLabel?: string;
    locale?: string;
    disabled?: boolean;
    allowAllDay?: boolean;
    dateError?: string | null;
    timeError?: string | null;
  }>(),
  {
    modelValue: () => ({ date: null, time: null, allDay: false }),
    dateLabel: 'Date',
    timeLabel: 'Time',
    allDayLabel: 'All day',
    locale: 'en-US',
    disabled: false,
    allowAllDay: true,
    dateError: null,
    timeError: null,
  },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: DateTimeFieldValue): void;
}>();

const generatedId = useId();
const baseId = computed(() => props.id ?? `date-time-field-${generatedId}`);

function patch(next: Partial<DateTimeFieldValue>) {
  emit('update:modelValue', { ...props.modelValue, ...next });
}
function updateDate(date: Ymd | null) {
  patch({ date });
}
function updateTime(time: Hm | null) {
  patch({ time });
}
function updateAllDay(allDay: boolean) {
  patch({ allDay, ...(allDay ? { time: null } : {}) });
}
</script>

<template>
  <fieldset class="grid gap-3" :disabled="disabled">
    <div class="grid gap-3 sm:grid-cols-2">
      <DateField
        :id="`${baseId}-date`"
        :model-value="modelValue.date"
        :label="dateLabel"
        :locale="locale"
        :disabled="disabled"
        :error="dateError"
        @update:model-value="updateDate"
      />
      <TimeField
        v-if="!modelValue.allDay"
        :id="`${baseId}-time`"
        :model-value="modelValue.time"
        :label="timeLabel"
        :disabled="disabled"
        :error="timeError"
        @update:model-value="updateTime"
      />
    </div>
    <div v-if="allowAllDay" class="flex items-center gap-2">
      <Switch
        :id="`${baseId}-all-day`"
        :model-value="modelValue.allDay"
        :disabled="disabled"
        @update:model-value="updateAllDay"
      />
      <Label :for="`${baseId}-all-day`">{{ allDayLabel }}</Label>
    </div>
  </fieldset>
</template>
