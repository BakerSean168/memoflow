<template>
  <Popover v-model:open="timePopoverOpen" @update:open="handleTimePopoverOpenChange">
    <PopoverTrigger as-child>
      <ProductPropertyChip
        :disabled="disabled"
        :aria-label="t('routine.form.localTime')"
        data-testid="routine-local-time-chip"
      >
        <template #icon><Clock3 class="h-3.5 w-3.5" /></template>
        {{ localTime }}
      </ProductPropertyChip>
    </PopoverTrigger>
    <ProductPopoverSurface recipe="property" content-class="w-auto space-y-2">
      <p class="text-xs font-medium text-muted-foreground">
        {{ t('routine.form.localTime') }}
      </p>
      <ProductTimePicker
        ref="timePickerRef"
        v-model="localTime"
        test-id="routine-local-time"
        :label="t('routine.form.localTime')"
        :hour-label="t('routine.form.hour')"
        :minute-label="t('routine.form.minute')"
        :disabled="disabled"
      />
    </ProductPopoverSurface>
  </Popover>

  <ProductDatePicker
    :model-value="parseYmd(startDate)"
    :allowed-kinds="['day']"
    test-id="routine-start-date"
    :label="t('routine.form.startDate')"
    :aria-label="t('routine.form.startDate')"
    :disabled="disabled"
    @update:model-value="startDate = $event ?? ''"
  />

  <Popover>
    <PopoverTrigger as-child>
      <ProductPropertyChip
        :disabled="disabled"
        :aria-label="t('routine.form.frequency')"
        data-testid="routine-frequency-chip"
      >
        <template #icon><Repeat2 class="h-3.5 w-3.5" /></template>
        {{ recurrenceSummary }}
      </ProductPropertyChip>
    </PopoverTrigger>
    <ProductPopoverSurface recipe="property" content-class="w-72 space-y-3">
      <div class="space-y-1.5">
        <p class="text-xs font-medium text-muted-foreground">
          {{ t('routine.form.frequency') }}
        </p>
        <div
          class="grid grid-cols-2 gap-1.5"
          role="radiogroup"
          :aria-label="t('routine.form.frequency')"
        >
          <Button
            v-for="option in frequencyOptions"
            :key="option.value"
            type="button"
            size="sm"
            :variant="frequency === option.value ? 'secondary' : 'ghost'"
            class="h-8 justify-start px-2.5 text-xs font-normal"
            role="radio"
            :aria-checked="frequency === option.value"
            :disabled="disabled"
            :data-testid="`routine-frequency-option-${option.value}`"
            @click="updateFrequency(option.value)"
          >
            {{ option.label }}
          </Button>
        </div>
      </div>

      <div class="space-y-1.5">
        <p class="text-xs font-medium text-muted-foreground">
          {{ t('routine.form.interval') }}
        </p>
        <div class="flex items-center gap-2">
          <NumberField
            v-model="recurrenceInterval"
            :min="1"
            :step="1"
            :disabled="disabled"
            data-testid="routine-recurrenceInterval"
            class="w-36"
          >
            <NumberFieldContent>
              <NumberFieldDecrement :aria-label="t('routine.form.interval') + ' −'" />
              <NumberFieldInput :aria-label="t('routine.form.interval')" class="h-8" />
              <NumberFieldIncrement :aria-label="t('routine.form.interval') + ' +'" />
            </NumberFieldContent>
          </NumberField>
          <span class="min-w-8 text-xs text-muted-foreground">{{ frequencyUnit }}</span>
        </div>
      </div>

      <div v-if="frequency === 'weekly'" class="space-y-1.5">
        <p class="text-xs font-medium text-muted-foreground">
          {{ t('routine.form.weekdays') }}
        </p>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="weekday in weekdayOptions"
            :key="weekday.value"
            type="button"
            class="h-7 min-w-7 rounded-md px-2 text-xs transition-colors"
            :class="
              selectedWeekdays.includes(weekday.value)
                ? 'bg-muted text-foreground'
                : 'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--hover))] hover:text-foreground'
            "
            :aria-label="weekday.listLabel"
            :aria-pressed="selectedWeekdays.includes(weekday.value)"
            :disabled="disabled"
            :data-testid="`routine-weekday-${weekday.value}`"
            @click="toggleWeekday(weekday.value)"
          >
            {{ weekday.label }}
          </button>
        </div>
      </div>
    </ProductPopoverSurface>
  </Popover>

  <ProductTimeZoneSelector
    v-model="timeZone"
    test-id="routine-time-zone"
    align="start"
    :label="t('routine.form.timeZone')"
    :product-zone-label="t('routine.form.defaultTimeZone')"
    :search-placeholder="t('routine.form.searchTimeZones')"
    :empty-text="t('routine.form.noTimeZonesFound')"
    :disabled="disabled"
  />
</template>

<script setup lang="ts">
import { routineUiHost } from '../routine-ui-host';
const {
  ProductDatePicker,
  ProductPopoverSurface,
  ProductPropertyChip,
  ProductTimePicker,
  ProductTimeZoneSelector,
} = routineUiHost.components;

import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Clock3, Repeat2 } from '@lucide/vue';
import { parseYmd } from '@memoflow/shared-primitives';
import {
  Button,
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
  Popover,
  PopoverTrigger,
} from '@memoflow/ui-vue-shadcn';

import type { RoutineFrequency } from './routine-editor.types';

defineProps<{ disabled?: boolean }>();

const localTime = defineModel<string>('localTime', { required: true });
const startDate = defineModel<string>('startDate', { required: true });
const frequency = defineModel<RoutineFrequency>('frequency', { required: true });
const recurrenceInterval = defineModel<number>('recurrenceInterval', { required: true });
const selectedWeekdays = defineModel<number[]>('selectedWeekdays', { required: true });
const timeZone = defineModel<string>('timeZone', { required: true });
const { t } = useI18n();

const timePopoverOpen = ref(false);
const timePickerRef = ref<{ commitDraft?: () => string | null } | null>(null);

const frequencyOptions = computed(() => [
  { value: 'daily' as const, label: t('routine.trigger.daily') },
  { value: 'weekly' as const, label: t('routine.trigger.weekly') },
  { value: 'monthly' as const, label: t('routine.trigger.monthly') },
  { value: 'yearly' as const, label: t('routine.trigger.yearly') },
]);
const frequencyLabel = computed(
  () => frequencyOptions.value.find((option) => option.value === frequency.value)?.label ?? '',
);
const weekdayOptions = computed(() => [
  {
    value: 1,
    label: t('routine.form.weekdaysShort.mon'),
    listLabel: t('routine.form.weekdaysList.mon'),
  },
  {
    value: 2,
    label: t('routine.form.weekdaysShort.tue'),
    listLabel: t('routine.form.weekdaysList.tue'),
  },
  {
    value: 3,
    label: t('routine.form.weekdaysShort.wed'),
    listLabel: t('routine.form.weekdaysList.wed'),
  },
  {
    value: 4,
    label: t('routine.form.weekdaysShort.thu'),
    listLabel: t('routine.form.weekdaysList.thu'),
  },
  {
    value: 5,
    label: t('routine.form.weekdaysShort.fri'),
    listLabel: t('routine.form.weekdaysList.fri'),
  },
  {
    value: 6,
    label: t('routine.form.weekdaysShort.sat'),
    listLabel: t('routine.form.weekdaysList.sat'),
  },
  {
    value: 0,
    label: t('routine.form.weekdaysShort.sun'),
    listLabel: t('routine.form.weekdaysList.sun'),
  },
]);
const frequencyUnit = computed(() => t(`routine.form.frequencyUnits.${frequency.value}`));

const recurrenceSummary = computed(() => {
  const interval = Math.max(1, Math.trunc(recurrenceInterval.value || 1));
  const base =
    interval === 1
      ? frequencyLabel.value
      : t('routine.form.recurrenceEvery', { interval, unit: frequencyUnit.value });

  if (frequency.value === 'weekly' && selectedWeekdays.value.length > 0) {
    const orderedDays = weekdayOptions.value
      .filter((option) => selectedWeekdays.value.includes(option.value))
      .map((option) => option.listLabel)
      .join(t('routine.form.weekdaySeparator'));
    if (interval === 1) {
      return t('routine.form.recurrenceWeeklyDays', { base, days: orderedDays });
    }
    return t('routine.form.recurrenceIntervalWeeklyDays', { base, days: orderedDays });
  }

  return base;
});

function handleTimePopoverOpenChange(open: boolean): void {
  if (!open) {
    timePickerRef.value?.commitDraft?.();
  }
}

function updateFrequency(value: unknown): void {
  if (typeof value !== 'string') return;
  const option = frequencyOptions.value.find((candidate) => candidate.value === value);
  if (option) frequency.value = option.value;
}

function toggleWeekday(weekday: number): void {
  selectedWeekdays.value = selectedWeekdays.value.includes(weekday)
    ? selectedWeekdays.value.filter((value) => value !== weekday)
    : [...selectedWeekdays.value, weekday];
}
</script>
