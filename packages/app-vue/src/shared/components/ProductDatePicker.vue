<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <ProductPropertyChip
        v-if="variant === 'chip'"
        :disabled="disabled"
        :data-testid="testId"
        :aria-label="ariaLabel"
      >
        <template #icon><CalendarDays class="h-3.5 w-3.5" /></template>
        {{ triggerLabel }}
      </ProductPropertyChip>
      <Button
        v-else
        type="button"
        variant="outline"
        class="w-full justify-start text-left font-normal"
        :class="{ 'text-muted-foreground': !modelValue }"
        :disabled="disabled"
        :data-testid="testId"
        :aria-label="ariaLabel"
      >
        <CalendarDays class="mr-2 h-4 w-4" />
        {{ resolvedLabel || label }}
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      class="w-[19rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[10px] border-border/80 bg-[hsl(var(--surface-overlay))] p-0 shadow-lg dark:border-white/10 dark:shadow-[0_18px_40px_rgba(0,0,0,0.38),0_2px_8px_rgba(0,0,0,0.24)]"
    >
      <ProductTemporalPickerSurface
        :label="label"
        :query="query"
        :kind="kind"
        :parse-error="parseError"
        :selected-date="selectedDate"
        :return-date="calendarReturnDate"
        :year-value="yearValue"
        :month-value="monthValue"
        :quarter-value="quarterValue"
        :half-value="halfValue"
        :locale="productLocale"
        :week-starts-on="weekStartsOn"
        :test-id="testId"
        :ariaLabel="ariaLabel"
        :input-placeholder="inputPlaceholder"
        :invalid-text="invalidText"
        :day-label="dayLabel"
        :month-label="monthLabel"
        :quarter-label="quarterLabel"
        :half-year-label="halfYearLabel"
        :year-label="yearLabel"
        :clear-label="clearLabel"
        :allowed-kinds="allowedKinds"
        :return-to-selected-label="returnToTodayLabel"
        @update:query="query = $event"
        @commit-query="commitQuery"
        @select-kind="selectKind"
        @calendar="handleCalendarValue"
        @update-year="updateYear"
        @select-month="selectMonth"
        @select-quarter="selectQuarter"
        @select-half="selectHalf"
        @clear="clear"
      />
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CalendarDays } from '@lucide/vue';
import type { Ymd } from '@memoflow/contracts/primitives';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@memoflow/ui-vue-shadcn';
import ProductPropertyChip from './ProductPropertyChip.vue';
import ProductTemporalPickerSurface, { type TemporalPickerKind } from './ProductTemporalPickerSurface.vue';
import { handleCalendarSelect } from '../utils/handle-calendar-select';
import { parseToCalendarDate } from '../utils/parse-to-date';
import {
  formatProductYmd,
  getProductLocale,
  getProductTodayYmd,
  getProductWeekStartsOn,
  productTimeRevision,
} from '../utils/product-time';
import {
  parseExplicitProductDateInput,
  parsedProductDateStartYmd,
  type ParsedProductDateInput,
} from '../utils/parse-explicit-product-date';

const props = withDefaults(
  defineProps<{
    modelValue: Ymd | null;
    label: string;
    placeholder?: string;
    inputPlaceholder?: string;
    formatHint?: string;
    invalidText?: string;
    clearLabel?: string;
    returnToTodayLabel?: string;
    testId?: string;
    ariaLabel?: string;
    disabled?: boolean;
    variant?: 'chip' | 'field';
    dayLabel?: string;
    monthLabel?: string;
    quarterLabel?: string;
    halfYearLabel?: string;
    yearLabel?: string;
    allowedKinds?: readonly TemporalPickerKind[];
  }>(),
  {
    placeholder: '',
    inputPlaceholder: 'Try: 2027/05/20, May 2027, Q4 2027',
    formatHint: 'YYYY-MM-DD · May 2027 · Q4 2027 · 2027',
    invalidText: 'Enter a supported date format.',
    clearLabel: 'Clear',
    returnToTodayLabel: 'Return to today',
    testId: 'product-date-picker',
    ariaLabel: 'Choose date',
    disabled: false,
    variant: 'chip',
    dayLabel: 'Day',
    monthLabel: 'Month',
    quarterLabel: 'Quarter',
    halfYearLabel: 'Half',
    yearLabel: 'Year',
    allowedKinds: () => ['day', 'month', 'quarter', 'halfYear', 'year'],
  },
);
const emit = defineEmits<{ 'update:modelValue': [Ymd | null] }>();

const open = ref(false);
const query = ref('');
const parseError = ref(false);

const effectiveAllowedKinds = computed<readonly TemporalPickerKind[]>(() =>
  props.allowedKinds.length > 0
    ? props.allowedKinds
    : ['day', 'month', 'quarter', 'halfYear', 'year'],
);
const kind = ref<TemporalPickerKind>(effectiveAllowedKinds.value[0] ?? 'day');
const yearValue = ref(Number(getProductTodayYmd().slice(0, 4)));
const monthValue = ref(1);
const quarterValue = ref<1 | 2 | 3 | 4>(1);
const halfValue = ref<1 | 2>(1);

const productLocale = computed(() => {
  void productTimeRevision.value;
  return getProductLocale();
});
const weekStartsOn = computed(() => {
  void productTimeRevision.value;
  return getProductWeekStartsOn();
});

const selectedDate = computed(() =>
  props.modelValue ? parseToCalendarDate(props.modelValue) : undefined,
);
const calendarReturnDate = computed(() => {
  void productTimeRevision.value;
  return parseToCalendarDate(getProductTodayYmd());
});
const resolvedLabel = computed(() =>
  props.modelValue ? formatProductYmd(props.modelValue) : props.placeholder,
);
const triggerLabel = computed(() =>
  props.modelValue ? formatProductYmd(props.modelValue) : props.placeholder || props.label,
);

function seedControlsFromYmd(date: Ymd): void {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  yearValue.value = year;
  monthValue.value = month;
  quarterValue.value = Math.ceil(month / 3) as 1 | 2 | 3 | 4;
  halfValue.value = month <= 6 ? 1 : 2;
}
function isKindAllowed(value: TemporalPickerKind): boolean {
  return effectiveAllowedKinds.value.includes(value);
}

function setPrecision(value: ParsedProductDateInput): void {
  kind.value = isKindAllowed(value.kind)
    ? value.kind
    : (effectiveAllowedKinds.value[0] ?? 'day');
  if (value.kind === 'day') {
    seedControlsFromYmd(value.date as Ymd);
    return;
  }
  yearValue.value = value.year;
  if (value.kind === 'month') monthValue.value = value.month;
  if (value.kind === 'quarter') quarterValue.value = value.quarter;
  if (value.kind === 'halfYear') halfValue.value = value.half;
}
function commit(value: Parameters<typeof parsedProductDateStartYmd>[0]): void {
  setPrecision(value);
  const ymd = parsedProductDateStartYmd(value);
  query.value = ymd.replace(/-/g, '/');
  parseError.value = false;
  emit('update:modelValue', ymd);
}

watch(
  () => props.modelValue,
  (value) => {
    query.value = value ? value.replace(/-/g, '/') : '';
    parseError.value = false;
    const parsed = value ? parseExplicitProductDateInput(value) : null;
    if (parsed) setPrecision(parsed);
    else {
      kind.value = 'day';
      seedControlsFromYmd(getProductTodayYmd());
    }
  },
  { immediate: true },
);

function commitQuery(): void {
  const parsed = parseExplicitProductDateInput(query.value);
  if (!parsed || !isKindAllowed(parsed.kind)) {
    parseError.value = true;
    return;
  }
  parseError.value = false;
  commit(parsed);
}

function selectKind(value: unknown): void {
  if (typeof value !== 'string' || !value) return;
  const nextKind = value as TemporalPickerKind;
  if (!isKindAllowed(nextKind)) return;
  kind.value = nextKind;
  parseError.value = false;
  // Precision tabs only switch the editing surface. A concrete Ymd is emitted
  // after the user chooses a date/period, never from an arbitrary default.
}
function updateYear(value: number): void {
  yearValue.value = value;
  if (kind.value === 'year' && Number.isInteger(value) && value >= 1 && value <= 9999) {
    commit({ kind: 'year', year: value });
  }
}
function selectMonth(value: number): void { monthValue.value = value; commit({ kind: 'month', year: yearValue.value, month: value }); }
function selectQuarter(value: 1 | 2 | 3 | 4): void { quarterValue.value = value; commit({ kind: 'quarter', year: yearValue.value, quarter: value }); }
function selectHalf(value: 1 | 2): void { halfValue.value = value; commit({ kind: 'halfYear', year: yearValue.value, half: value }); }

function handleCalendarValue(value: unknown): void {
  handleCalendarSelect(value, (ymd) => {
    parseError.value = false;
    if (ymd) commit({ kind: 'day', date: ymd as Ymd });
  });
}

function clear(): void {
  parseError.value = false;
  query.value = '';
  emit('update:modelValue', null);
}
</script>
