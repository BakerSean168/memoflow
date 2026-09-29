<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <ProductPropertyChip :disabled="disabled" :data-testid="testId" :aria-label="ariaLabel">
        <template #icon><CalendarRange class="h-3.5 w-3.5" /></template>
        {{ triggerLabel }}
      </ProductPropertyChip>
    </PopoverTrigger>

    <PopoverContent
      align="start"
      class="w-[19rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-overlay))] p-0 shadow-[0_18px_48px_-22px_rgba(0,0,0,0.52),0_4px_14px_-10px_rgba(0,0,0,0.45),inset_0_1px_0_hsl(var(--foreground)/0.025)]"
    >
      <ProductTemporalPickerSurface
        :label="label"
        :query="query"
        :kind="kind"
        :parse-error="parseError || constraintError"
        :selected-date="dayValue ? parseToCalendarDate(dayValue) : undefined"
        :return-date="calendarReturnDate"
        :min-date="calendarMinDate"
        :max-date="calendarMaxDate"
        :disabled-months="disabledMonths"
        :disabled-quarters="disabledQuarters"
        :disabled-halves="disabledHalves"
        :year-value="yearValue"
        :month-value="monthValue"
        :quarter-value="quarterValue"
        :half-value="halfValue"
        :locale="productLocale"
        :week-starts-on="weekStartsOn"
        :test-id="testId"
        :ariaLabel="ariaLabel"
        :input-placeholder="inputPlaceholder"
        :invalid-text="constraintError ? constraintText : invalidText"
        :day-label="dayLabel"
        :month-label="monthLabel"
        :quarter-label="quarterLabel"
        :half-year-label="halfYearLabel"
        :year-label="yearLabel"
        :clear-label="clearLabel"
        :return-to-selected-label="returnToSelectedLabel"
        @update:query="updateQuery"
        @commit-query="commitQuery"
        @select-kind="selectKind"
        @calendar="handleDayCalendar"
        @update-year="updateYear"
        @select-month="selectMonth"
        @select-quarter="selectQuarter"
        @select-half="selectHalf"
        @clear="clearTarget"
      />
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CalendarRange } from '@lucide/vue';
type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;
import {
  goalTimeframeEndBoundary,
  goalTimeframeLabel,
  goalTimeframeStartBoundary,
  type GoalTimeframe,
  type GoalTimeframeKind,
} from '@memoflow/contracts/goal';
import type { Ymd } from '@memoflow/contracts/primitives';
import { Popover, PopoverContent, PopoverTrigger } from '@memoflow/ui-vue-shadcn';
import ProductPropertyChip from './ProductPropertyChip.vue';
import ProductTemporalPickerSurface from './ProductTemporalPickerSurface.vue';
import {
  formatProductYmd,
  getProductTime,
  getProductTodayYmd,
  productTimeRevision,
} from '../utils/product-time';
import { parseToCalendarDate } from '../utils/parse-to-date';
import { handleCalendarSelect } from '../utils/handle-calendar-select';
import { parseExplicitProductDateInput } from '../utils/parse-explicit-product-date';

const props = withDefaults(
  defineProps<{
    modelValue: GoalTimeframe | null;
    label: string;
    disabled?: boolean;
    testId?: string;
    ariaLabel?: string;
    placeholder?: string;
    inputPlaceholder?: string;
    precisionHint?: string;
    invalidText?: string;
    dayLabel?: string;
    monthLabel?: string;
    quarterLabel?: string;
    halfYearLabel?: string;
    yearLabel?: string;
    clearLabel?: string;
    returnToSelectedLabel?: string;
    constraintText?: string;
    minEndBoundary?: Ymd;
    maxStartBoundary?: Ymd;
    locale?: string;
  }>(),
  {
    disabled: false,
    testId: 'product-timeframe-picker',
    ariaLabel: 'Target timeframe',
    placeholder: '',
    inputPlaceholder: 'Try: May 2027, Q4 2027, 2027/05/20',
    precisionHint: 'Day · Month · Quarter · Half-year · Year',
    invalidText: 'Enter a supported date format.',
    dayLabel: 'Day',
    monthLabel: 'Month',
    quarterLabel: 'Quarter',
    halfYearLabel: 'Half',
    yearLabel: 'Year',
    clearLabel: 'Clear',
    returnToSelectedLabel: 'Return to today',
    constraintText: 'This timeframe conflicts with the current planning window.',
    minEndBoundary: undefined,
    maxStartBoundary: undefined,
    locale: 'en-US',
  },
);
const emit = defineEmits<{ 'update:modelValue': [GoalTimeframe | null] }>();

const open = ref(false);
const query = ref('');
const parseError = ref(false);
const constraintError = ref(false);
const kind = ref<GoalTimeframeKind>('day');
const dayValue = ref('');
const yearValue = ref(2026);
const monthValue = ref(1);
const quarterValue = ref<1 | 2 | 3 | 4>(1);
const halfValue = ref<1 | 2>(1);

const productLocale = computed(() => {
  void productTimeRevision.value;
  return getProductTime().presentation.locale;
});
const weekStartsOn = computed(() => {
  void productTimeRevision.value;
  return getProductTime().context.weekStartsOn as WeekStartsOn;
});
const calendarReturnDate = computed(() => {
  void productTimeRevision.value;
  return parseToCalendarDate(getProductTodayYmd());
});
const calendarMinDate = computed(() =>
  props.minEndBoundary ? parseToCalendarDate(props.minEndBoundary) : undefined,
);
const calendarMaxDate = computed(() =>
  props.maxStartBoundary ? parseToCalendarDate(props.maxStartBoundary) : undefined,
);

function isCandidateAllowed(value: GoalTimeframe): boolean {
  if (
    props.minEndBoundary &&
    goalTimeframeEndBoundary(value) < props.minEndBoundary
  ) {
    return false;
  }
  if (
    props.maxStartBoundary &&
    goalTimeframeStartBoundary(value) > props.maxStartBoundary
  ) {
    return false;
  }
  return true;
}

const disabledMonths = computed(() => {
  const year = validYear();
  if (!year) return [];
  return Array.from({ length: 12 }, (_, index) => index + 1).filter(
    (month) => !isCandidateAllowed({ kind: 'month', year, month }),
  );
});
const disabledQuarters = computed(() => {
  const year = validYear();
  if (!year) return [];
  return ([1, 2, 3, 4] as const).filter(
    (quarter) => !isCandidateAllowed({ kind: 'quarter', year, quarter }),
  );
});
const disabledHalves = computed(() => {
  const year = validYear();
  if (!year) return [];
  return ([1, 2] as const).filter(
    (half) => !isCandidateAllowed({ kind: 'halfYear', year, half }),
  );
});

function validYear(): number | null {
  const year = Number(yearValue.value);
  return Number.isInteger(year) && year >= 1 && year <= 9999 ? year : null;
}
function formatQuery(value: GoalTimeframe | null): string {
  if (!value) return '';
  if (value.kind === 'day') return value.date.replace(/-/g, '/');
  if (value.kind === 'month') return `${value.year}-${String(value.month).padStart(2, '0')}`;
  if (value.kind === 'quarter') return `Q${value.quarter} ${value.year}`;
  if (value.kind === 'halfYear') return `H${value.half} ${value.year}`;
  return String(value.year);
}
function seedControlsFromYmd(date: Ymd): void {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  yearValue.value = year;
  monthValue.value = month;
  quarterValue.value = Math.ceil(month / 3) as 1 | 2 | 3 | 4;
  halfValue.value = month <= 6 ? 1 : 2;
}
function timeframeFromAnchor(kindValue: GoalTimeframeKind, anchor: Ymd): GoalTimeframe {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  if (kindValue === 'day') return { kind: 'day', date: anchor };
  if (kindValue === 'month') return { kind: 'month', year, month };
  if (kindValue === 'quarter') {
    return { kind: 'quarter', year, quarter: Math.ceil(month / 3) as 1 | 2 | 3 | 4 };
  }
  if (kindValue === 'halfYear') return { kind: 'halfYear', year, half: month <= 6 ? 1 : 2 };
  return { kind: 'year', year };
}
function sync(value: GoalTimeframe | null): void {
  query.value = formatQuery(value);
  parseError.value = false;
  constraintError.value = false;
  const anchor = value ? goalTimeframeStartBoundary(value) : getProductTodayYmd();
  seedControlsFromYmd(anchor);
  dayValue.value = value?.kind === 'day' ? value.date : '';
  kind.value = value?.kind ?? 'day';
}
watch(() => props.modelValue, sync, { immediate: true, deep: true });
watch(
  () => [props.minEndBoundary, props.maxStartBoundary],
  () => {
    constraintError.value = false;
  },
);

const triggerLabel = computed(() => {
  if (!props.modelValue) return props.placeholder || props.label;
  if (props.modelValue.kind === 'day') return formatProductYmd(props.modelValue.date);
  return goalTimeframeLabel(props.modelValue, props.locale);
});

function emitTarget(value: GoalTimeframe | null): boolean {
  parseError.value = false;
  if (value && !isCandidateAllowed(value)) {
    constraintError.value = true;
    return false;
  }
  constraintError.value = false;
  emit('update:modelValue', value);
  sync(value);
  return true;
}
function updateQuery(value: string): void {
  query.value = value;
  parseError.value = false;
  constraintError.value = false;
}
function commitQuery(): void {
  const parsed = parseExplicitProductDateInput(query.value);
  if (!parsed) {
    parseError.value = true;
    return;
  }
  emitTarget(parsed as GoalTimeframe);
}
function selectKind(value: unknown): void {
  if (typeof value !== 'string' || !value) return;
  const nextKind = value as GoalTimeframeKind;
  kind.value = nextKind;
  parseError.value = false;

  // Precision tabs are navigation when the Goal has no value yet. Do not
  // silently create January/Q1/H1 just because the user is exploring modes.
  if (!props.modelValue) {
    if (nextKind === 'year') commitYear();
    return;
  }

  // For an existing semantic value, changing precision intentionally converts
  // the same planning anchor rather than jumping to an unrelated default.
  const candidate = timeframeFromAnchor(nextKind, goalTimeframeStartBoundary(props.modelValue));
  if (!emitTarget(candidate)) kind.value = props.modelValue.kind;
}
function updateYear(value: number): void {
  yearValue.value = value;
  if (kind.value === 'year') {
    commitYear();
    return;
  }
  if (!props.modelValue) return;
  if (kind.value === 'month') commitMonth();
  else if (kind.value === 'quarter') commitQuarter();
  else if (kind.value === 'halfYear') commitHalfYear();
}
function selectMonth(value: number): void {
  monthValue.value = value;
  commitMonth();
}
function selectQuarter(value: 1 | 2 | 3 | 4): void {
  quarterValue.value = value;
  commitQuarter();
}
function selectHalf(value: 1 | 2): void {
  halfValue.value = value;
  commitHalfYear();
}
function handleDayCalendar(value: unknown): void {
  handleCalendarSelect(value, (date) => {
    dayValue.value = date;
    if (date) emitTarget({ kind: 'day', date: date as Ymd });
  });
}
function commitMonth(): void {
  const year = validYear();
  if (year && monthValue.value >= 1 && monthValue.value <= 12)
    emitTarget({ kind: 'month', year, month: monthValue.value });
}
function commitQuarter(): void {
  const year = validYear();
  if (year) emitTarget({ kind: 'quarter', year, quarter: quarterValue.value });
}
function commitHalfYear(): void {
  const year = validYear();
  if (year) emitTarget({ kind: 'halfYear', year, half: halfValue.value });
}
function commitYear(): void {
  const year = validYear();
  if (year) emitTarget({ kind: 'year', year });
}
function clearTarget(): void {
  emitTarget(null);
}
</script>
