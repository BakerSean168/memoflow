<script setup lang="ts">
import type { Ymd } from '@memoflow/time';
import { calendarDateValueToYmd, ymdToCalendarDateValue } from '@memoflow/time';
import { CalendarDays } from '@lucide/vue';
import { computed, useId } from 'vue';
import { Button } from '../../../ui/button';
import { Calendar } from '../../../ui/calendar';
import { Label } from '../../../ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/popover';

const props = withDefaults(
  defineProps<{
    modelValue?: Ymd | null;
    id?: string;
    label?: string;
    placeholder?: string;
    locale?: string;
    disabled?: boolean;
    error?: string | null;
  }>(),
  {
    modelValue: null,
    label: 'Date',
    placeholder: 'Select date',
    locale: 'en-US',
    disabled: false,
    error: null,
  },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: Ymd | null): void;
}>();

const generatedId = useId();
const fieldId = computed(() => props.id ?? `date-field-${generatedId}`);
const errorId = computed(() => `${fieldId.value}-error`);
const calendarValue = computed(() =>
  props.modelValue ? ymdToCalendarDateValue(props.modelValue) : undefined,
);

function updateDate(value: unknown) {
  if (!value) {
    emit('update:modelValue', null);
    return;
  }
  emit(
    'update:modelValue',
    calendarDateValueToYmd(value as ReturnType<typeof ymdToCalendarDateValue>),
  );
}
</script>

<template>
  <div class="grid gap-1.5">
    <Label :for="fieldId">{{ label }}</Label>
    <Popover>
      <PopoverTrigger as-child>
        <Button
          :id="fieldId"
          type="button"
          variant="outline"
          class="w-full justify-start font-normal"
          :disabled="disabled"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="error ? errorId : undefined"
        >
          <CalendarDays class="mr-1 size-4" aria-hidden="true" />
          <span :class="!modelValue ? 'text-muted-foreground' : undefined">
            {{ modelValue ?? placeholder }}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-auto p-0" align="start">
        <Calendar
          :model-value="calendarValue"
          :locale="locale"
          :disabled="disabled"
          initial-focus
          @update:model-value="updateDate"
        />
      </PopoverContent>
    </Popover>
    <p v-if="error" :id="errorId" class="text-xs text-destructive" role="alert">
      {{ error }}
    </p>
  </div>
</template>
