<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <ProductPropertyChip :disabled="disabled" :data-testid="testId" :aria-label="ariaLabel">
        <template #icon><CalendarRange class="h-3.5 w-3.5" /></template>
        {{ triggerLabel }}
      </ProductPropertyChip>
    </PopoverTrigger>

    <PopoverContent align="start" class="w-80 max-w-[calc(100vw-2rem)] p-0">
      <div class="space-y-2 border-b border-border/70 p-3">
        <p class="text-sm font-medium">{{ label }}</p>
        <Input
          v-model="query"
          :placeholder="inputPlaceholder"
          :data-testid="`${testId}-query`"
          :aria-label="ariaLabel"
          @keydown.enter.prevent="commitQuery"
        />
        <p v-if="parseError" class="text-xs text-destructive" role="alert">{{ invalidText }}</p>
        <p v-else class="text-[11px] text-muted-foreground">{{ precisionHint }}</p>
      </div>

      <div class="border-b border-border/70 p-3">
        <ToggleGroup
          :model-value="kind"
          type="single"
          variant="outline"
          class="grid grid-cols-5"
          @update:model-value="selectKind"
        >
          <ToggleGroupItem value="day" class="px-2 text-xs">{{ dayLabel }}</ToggleGroupItem>
          <ToggleGroupItem value="month" class="px-2 text-xs">{{ monthLabel }}</ToggleGroupItem>
          <ToggleGroupItem value="quarter" class="px-2 text-xs">{{ quarterLabel }}</ToggleGroupItem>
          <ToggleGroupItem value="halfYear" class="px-2 text-xs">{{
            halfYearLabel
          }}</ToggleGroupItem>
          <ToggleGroupItem value="year" class="px-2 text-xs">{{ yearLabel }}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div class="p-2">
        <Calendar
          v-if="kind === 'day'"
          mode="single"
          :selected="dayValue ? parseToCalendarDate(dayValue) : undefined"
          @update:model-value="handleDayCalendar"
        />

        <div v-else-if="kind === 'month'" class="space-y-3 p-2">
          <Input
            v-model.number="yearValue"
            type="number"
            min="1"
            max="9999"
            :aria-label="yearLabel"
            @update:model-value="commitMonth"
          />
          <div class="grid grid-cols-3 gap-1.5">
            <Button
              v-for="month in 12"
              :key="month"
              type="button"
              size="sm"
              :variant="monthValue === month ? 'secondary' : 'ghost'"
              @click="
                monthValue = month;
                commitMonth();
              "
            >
              {{ monthName(month) }}
            </Button>
          </div>
        </div>

        <div v-else-if="kind === 'quarter'" class="space-y-3 p-2">
          <Input
            v-model.number="yearValue"
            type="number"
            min="1"
            max="9999"
            :aria-label="yearLabel"
            @update:model-value="commitQuarter"
          />
          <div class="grid grid-cols-4 gap-2">
            <Button
              v-for="quarter in [1, 2, 3, 4] as const"
              :key="quarter"
              type="button"
              :variant="quarterValue === quarter ? 'secondary' : 'outline'"
              @click="
                quarterValue = quarter;
                commitQuarter();
              "
              >Q{{ quarter }}</Button
            >
          </div>
        </div>

        <div v-else-if="kind === 'halfYear'" class="space-y-3 p-2">
          <Input
            v-model.number="yearValue"
            type="number"
            min="1"
            max="9999"
            :aria-label="yearLabel"
            @update:model-value="commitHalfYear"
          />
          <div class="grid grid-cols-2 gap-2">
            <Button
              type="button"
              :variant="halfValue === 1 ? 'secondary' : 'outline'"
              @click="
                halfValue = 1;
                commitHalfYear();
              "
              >H1</Button
            >
            <Button
              type="button"
              :variant="halfValue === 2 ? 'secondary' : 'outline'"
              @click="
                halfValue = 2;
                commitHalfYear();
              "
              >H2</Button
            >
          </div>
        </div>

        <div v-else class="p-2">
          <Input
            v-model.number="yearValue"
            type="number"
            min="1"
            max="9999"
            :aria-label="yearLabel"
            @update:model-value="commitYear"
          />
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-border/70 px-3 py-2">
        <span class="min-w-0 truncate text-xs text-muted-foreground">{{ resolvedLabel }}</span>
        <Button type="button" variant="ghost" size="sm" @click="clearTarget">{{
          clearLabel
        }}</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CalendarRange } from '@lucide/vue';
import {
  goalTimeframeLabel,
  type GoalTimeframe,
  type GoalTimeframeKind,
} from '@memoflow/contracts/goal';
import type { Ymd } from '@memoflow/contracts/primitives';
import {
  Button,
  Calendar,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ToggleGroup,
  ToggleGroupItem,
} from '@memoflow/ui-vue-shadcn';
import ProductPropertyChip from './ProductPropertyChip.vue';
import { getProductTodayYmd } from '../utils/product-time';
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
    locale: 'en-US',
  },
);
const emit = defineEmits<{ 'update:modelValue': [GoalTimeframe | null] }>();

const open = ref(false);
const query = ref('');
const parseError = ref(false);
const kind = ref<GoalTimeframeKind>('day');
const dayValue = ref('');
const yearValue = ref(2026);
const monthValue = ref(1);
const quarterValue = ref<1 | 2 | 3 | 4>(1);
const halfValue = ref<1 | 2>(1);

function todayYear(): number {
  return Number(getProductTodayYmd().slice(0, 4));
}
function validYear(): number | null {
  const year = Number(yearValue.value);
  return Number.isInteger(year) && year >= 1 && year <= 9999 ? year : null;
}
function formatQuery(value: GoalTimeframe | null): string {
  if (!value) return '';
  if (value.kind === 'day') return value.date;
  if (value.kind === 'month') return `${value.year}-${String(value.month).padStart(2, '0')}`;
  if (value.kind === 'quarter') return `Q${value.quarter} ${value.year}`;
  if (value.kind === 'halfYear') return `H${value.half} ${value.year}`;
  return String(value.year);
}
function sync(value: GoalTimeframe | null): void {
  query.value = formatQuery(value);
  parseError.value = false;
  if (!value) {
    kind.value = 'day';
    dayValue.value = '';
    yearValue.value = todayYear();
    monthValue.value = 1;
    quarterValue.value = 1;
    halfValue.value = 1;
    return;
  }
  kind.value = value.kind;
  if (value.kind === 'day') {
    dayValue.value = value.date;
    yearValue.value = Number(value.date.slice(0, 4));
  } else if (value.kind === 'month') {
    yearValue.value = value.year;
    monthValue.value = value.month;
  } else if (value.kind === 'quarter') {
    yearValue.value = value.year;
    quarterValue.value = value.quarter as 1 | 2 | 3 | 4;
  } else if (value.kind === 'halfYear') {
    yearValue.value = value.year;
    halfValue.value = value.half as 1 | 2;
  } else {
    yearValue.value = value.year;
  }
}
watch(() => props.modelValue, sync, { immediate: true, deep: true });

const resolvedLabel = computed(() =>
  props.modelValue ? goalTimeframeLabel(props.modelValue, props.locale) : props.placeholder,
);
const triggerLabel = computed(() =>
  props.modelValue
    ? `${props.label}: ${goalTimeframeLabel(props.modelValue, props.locale)}`
    : props.placeholder || props.label,
);

function emitTarget(value: GoalTimeframe | null): void {
  parseError.value = false;
  emit('update:modelValue', value);
  sync(value);
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
  kind.value = value as GoalTimeframeKind;
  if (kind.value === 'day') {
    if (dayValue.value) emitTarget({ kind: 'day', date: dayValue.value as Ymd });
  } else if (kind.value === 'month') commitMonth();
  else if (kind.value === 'quarter') commitQuarter();
  else if (kind.value === 'halfYear') commitHalfYear();
  else commitYear();
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
function monthName(month: number): string {
  return new Intl.DateTimeFormat(props.locale, { month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2020, month - 1, 1)),
  );
}
</script>
