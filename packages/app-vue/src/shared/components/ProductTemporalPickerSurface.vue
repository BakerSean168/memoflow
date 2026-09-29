<template>
  <div class="w-full p-4">
    <div class="space-y-2">
      <p class="text-[13px] font-medium leading-5 text-foreground/75">{{ label }}</p>

      <div class="relative">
        <Input
          :model-value="query"
          :placeholder="inputPlaceholder"
          :data-testid="`${testId}-query`"
          :aria-label="ariaLabel"
          class="h-8 rounded-md border-border/80 bg-muted/20 px-2.5 pr-8 text-[13px] shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/40"
          @update:model-value="emit('update:query', String($event))"
          @keydown.enter.prevent="emit('commit-query')"
        />

        <button
          v-if="query"
          type="button"
          :aria-label="clearLabel"
          class="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          @pointerdown.prevent
          @click="emit('clear')"
        >
          <CircleX class="h-3.5 w-3.5" />
        </button>
      </div>

      <p v-if="parseError" class="text-xs text-destructive" role="alert">{{ invalidText }}</p>
    </div>

    <ToggleGroup
      v-if="precisionOptions.length > 1"
      :model-value="kind"
      type="single"
      variant="default"
      class="mt-3 flex w-full items-center gap-1 border-b border-border/55 pb-4"
      @update:model-value="emit('select-kind', $event)"
    >
      <ToggleGroupItem
        v-for="option in precisionOptions"
        :key="option.value"
        :value="option.value"
        :data-testid="`${testId}-precision-${option.value}`"
        class="h-7 min-w-0 shrink-0 rounded-full px-2 text-[11px] font-medium text-muted-foreground shadow-none hover:bg-accent/70 hover:text-foreground data-[state=on]:bg-[hsl(var(--selected))] data-[state=on]:text-foreground"
      >
        {{ option.label }}
      </ToggleGroupItem>
    </ToggleGroup>

    <Calendar
      v-if="kind === 'day'"
      appearance="linear"
      v-model:placeholder="calendarPlaceholder"
      :model-value="selectedDate"
      :locale="locale"
      :week-starts-on="weekStartsOn"
      :weekday-format="'short'"
      :fixed-weeks="true"
      :min-value="minDate"
      :max-value="maxDate"
      :return-date="returnDate"
      :return-to-selected-label="returnToSelectedLabel"
      class="pt-3.5"
      @update:model-value="emit('calendar', $event)"
    />

    <div v-else class="space-y-2.5 pt-2.5">
      <Input
        :model-value="yearValue"
        type="number"
        min="1"
        max="9999"
        :data-testid="`${testId}-year`"
        class="h-8 rounded-md border-border/80 bg-muted/20 px-2.5 text-[13px] shadow-none focus-visible:border-primary/50 focus-visible:ring-primary/40"
        :aria-label="yearLabel"
        @update:model-value="emit('update-year', Number($event))"
      />

      <div v-if="kind === 'month'" class="grid grid-cols-3 gap-1">
        <Button
          v-for="month in 12"
          :key="month"
          type="button"
          size="sm"
          :data-testid="`${testId}-month-${month}`"
          :variant="monthValue === month ? 'secondary' : 'ghost'"
          :disabled="disabledMonths?.includes(month)"
          class="h-7 rounded-md px-1 text-xs shadow-none disabled:cursor-not-allowed disabled:opacity-35"
          @click="emit('select-month', month)"
        >
          {{ monthName(month) }}
        </Button>
      </div>

      <div v-else-if="kind === 'quarter'" class="grid grid-cols-4 gap-1">
        <Button
          v-for="quarter in [1, 2, 3, 4] as const"
          :key="quarter"
          type="button"
          :data-testid="`${testId}-quarter-${quarter}`"
          :variant="quarterValue === quarter ? 'secondary' : 'ghost'"
          :disabled="disabledQuarters?.includes(quarter)"
          class="h-7 rounded-md px-1 text-xs shadow-none disabled:cursor-not-allowed disabled:opacity-35"
          @click="emit('select-quarter', quarter)"
        >
          Q{{ quarter }}
        </Button>
      </div>

      <div v-else-if="kind === 'halfYear'" class="grid grid-cols-2 gap-1">
        <Button
          v-for="half in [1, 2] as const"
          :key="half"
          type="button"
          :data-testid="`${testId}-half-${half}`"
          :variant="halfValue === half ? 'secondary' : 'ghost'"
          :disabled="disabledHalves?.includes(half)"
          class="h-7 rounded-md px-1 text-xs shadow-none disabled:cursor-not-allowed disabled:opacity-35"
          @click="emit('select-half', half)"
        >
          H{{ half }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { CircleX } from '@lucide/vue';
import type { DateValue } from '@internationalized/date';
import {
  Button,
  Calendar,
  Input,
  ToggleGroup,
  ToggleGroupItem,
} from '@memoflow/ui-vue-shadcn';

type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type TemporalPickerKind = 'day' | 'month' | 'quarter' | 'halfYear' | 'year';

const props = defineProps<{
  label: string;
  query: string;
  kind: TemporalPickerKind;
  parseError: boolean;
  selectedDate?: DateValue;
  returnDate?: DateValue;
  minDate?: DateValue;
  maxDate?: DateValue;
  disabledMonths?: number[];
  disabledQuarters?: number[];
  disabledHalves?: number[];
  yearValue: number;
  monthValue: number;
  quarterValue: 1 | 2 | 3 | 4;
  halfValue: 1 | 2;
  locale: string;
  weekStartsOn: WeekStartsOn;
  testId: string;
  ariaLabel: string;
  inputPlaceholder: string;
  invalidText: string;
  dayLabel: string;
  monthLabel: string;
  quarterLabel: string;
  halfYearLabel: string;
  yearLabel: string;
  clearLabel: string;
  allowedKinds?: readonly TemporalPickerKind[];
  returnToSelectedLabel?: string;
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  'commit-query': [];
  'select-kind': [value: unknown];
  calendar: [value: unknown];
  'update-year': [value: number];
  'select-month': [value: number];
  'select-quarter': [value: 1 | 2 | 3 | 4];
  'select-half': [value: 1 | 2];
  clear: [];
}>();

const calendarPlaceholder = shallowRef<DateValue | undefined>(props.selectedDate);
watch(
  () => props.selectedDate,
  (value) => {
    if (value) calendarPlaceholder.value = value;
  },
);

const precisionOptions = computed(() => {
  const allowed = new Set<TemporalPickerKind>(
    props.allowedKinds?.length
      ? props.allowedKinds
      : ['day', 'month', 'quarter', 'halfYear', 'year'],
  );
  return (
    [
      { value: 'day', label: props.dayLabel },
      { value: 'month', label: props.monthLabel },
      { value: 'quarter', label: props.quarterLabel },
      { value: 'halfYear', label: props.halfYearLabel },
      { value: 'year', label: props.yearLabel },
    ] satisfies { value: TemporalPickerKind; label: string }[]
  ).filter((option) => allowed.has(option.value));
});

function monthName(month: number): string {
  return new Intl.DateTimeFormat(props.locale, { month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2020, month - 1, 1)),
  );
}
</script>
