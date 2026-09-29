<template>
  <DropdownMenuItem
    :disabled="addDisabled"
    @select.prevent="addRelative(15, ReminderTimeUnit.Minutes)"
  >
    <Timer class="mr-2 h-4 w-4 text-muted-foreground" />
    <span class="min-w-0 flex-1">{{ t('task.reminderMenu.fifteenMinutesBefore') }}</span>
  </DropdownMenuItem>
  <DropdownMenuItem
    :disabled="addDisabled"
    @select.prevent="addRelative(1, ReminderTimeUnit.Hours)"
  >
    <Clock3 class="mr-2 h-4 w-4 text-muted-foreground" />
    <span class="min-w-0 flex-1">{{ t('task.reminderMenu.oneHourBefore') }}</span>
  </DropdownMenuItem>
  <DropdownMenuItem :disabled="addDisabled" @select.prevent="addRelative(1, ReminderTimeUnit.Days)">
    <CalendarClock class="mr-2 h-4 w-4 text-muted-foreground" />
    <span class="min-w-0 flex-1">{{ t('task.reminderMenu.oneDayBefore') }}</span>
  </DropdownMenuItem>

  <DropdownMenuSeparator />

  <DropdownMenuItem :disabled="addDisabled" @select.prevent="addAbsolute(oneHourPreset)">
    <Clock3 class="mr-2 h-4 w-4 text-muted-foreground" />
    <span class="min-w-0 flex-1">{{ t('task.reminderMenu.inOneHour') }}</span>
    <span class="ml-4 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
      {{ formatProductDateTime(oneHourPreset) }}
    </span>
  </DropdownMenuItem>
  <DropdownMenuItem :disabled="addDisabled" @select.prevent="addAbsolute(tomorrowPreset)">
    <Sunrise class="mr-2 h-4 w-4 text-muted-foreground" />
    <span class="min-w-0 flex-1">{{ t('task.reminderMenu.tomorrow') }}</span>
    <span class="ml-4 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
      {{ formatProductDateTime(tomorrowPreset) }}
    </span>
  </DropdownMenuItem>
  <DropdownMenuItem :disabled="addDisabled" @select.prevent="addAbsolute(nextWeekPreset)">
    <CalendarDays class="mr-2 h-4 w-4 text-muted-foreground" />
    <span class="min-w-0 flex-1">{{ t('task.reminderMenu.nextWeek') }}</span>
    <span class="ml-4 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
      {{ formatProductDateTime(nextWeekPreset) }}
    </span>
  </DropdownMenuItem>
  <DropdownMenuItem :disabled="addDisabled" @select.prevent="addAbsolute(nextMonthPreset)">
    <CalendarRange class="mr-2 h-4 w-4 text-muted-foreground" />
    <span class="min-w-0 flex-1">{{ t('task.reminderMenu.nextMonth') }}</span>
    <span class="ml-4 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
      {{ formatProductDateTime(nextMonthPreset) }}
    </span>
  </DropdownMenuItem>

  <DropdownMenuItem :disabled="addDisabled" @click="emit('request-custom-time')">
    <CalendarClock class="mr-2 h-4 w-4 text-muted-foreground" />
    {{ t('task.reminderMenu.customTime') }}
  </DropdownMenuItem>
  <DropdownMenuItem @click="emit('request-advanced')">
    <SlidersHorizontal class="mr-2 h-4 w-4 text-muted-foreground" />
    {{ t('task.reminderMenu.moreSettings') }}
  </DropdownMenuItem>

  <template v-if="atLimit">
    <DropdownMenuSeparator />
    <DropdownMenuItem disabled>
      {{ t('task.reminderMenu.maxRemindersReached') }}
    </DropdownMenuItem>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Clock3,
  Sunrise,
  Timer,
  SlidersHorizontal,
} from '@lucide/vue';
import {
  ReminderTimeUnit,
  TaskReminderType,
  type TaskReminderConfigDTO,
} from '@memoflow/contracts/task';
import type { Ymd } from '@memoflow/contracts/primitives';
import { DropdownMenuItem, DropdownMenuSeparator } from '@memoflow/ui-vue-shadcn';
import { addYmdDays } from '@memoflow/time';
import {
  formatProductDateTime,
  getProductTime,
  getProductTodayYmd,
  productTimeRevision,
} from '../../../shared/utils/product-time';

const props = withDefaults(
  defineProps<{
    modelValue: TaskReminderConfigDTO | null;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  'update:modelValue': [TaskReminderConfigDTO | null];
  'request-custom-time': [];
  'request-advanced': [];
}>();

const { t } = useI18n();
const MAX_REMINDERS = 10;

const activeTriggers = computed(() => (props.modelValue?.enabled ? props.modelValue.triggers : []));
const atLimit = computed(() => activeTriggers.value.length >= MAX_REMINDERS);
const addDisabled = computed(() => props.disabled || atLimit.value);

function currentNow(): number {
  return Number(getProductTime().now());
}

function roundToMinute(value: number): number {
  return Math.floor(value / 60_000) * 60_000;
}

const oneHourPreset = computed(() => {
  void productTimeRevision.value;
  return roundToMinute(currentNow() + 60 * 60 * 1000);
});

function atMorning(daysFromToday: number): number {
  const day = addYmdDays(getProductTodayYmd(), daysFromToday);
  return Number(getProductTime().input.combine(day, '09:00') ?? currentNow());
}

const tomorrowPreset = computed(() => {
  void productTimeRevision.value;
  return atMorning(1);
});

const nextWeekPreset = computed(() => {
  void productTimeRevision.value;
  return atMorning(7);
});

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function addOneCalendarMonth(date: Ymd): Ymd {
  const [year, month, day] = date.split('-').map(Number);
  const normalizedMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextDay = Math.min(day, daysInMonth(nextYear, normalizedMonth));
  return `${String(nextYear).padStart(4, '0')}-${String(normalizedMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}` as Ymd;
}

const nextMonthPreset = computed(() => {
  void productTimeRevision.value;
  const day = addOneCalendarMonth(getProductTodayYmd());
  return Number(getProductTime().input.combine(day, '09:00') ?? currentNow());
});

function appendTrigger(trigger: TaskReminderConfigDTO['triggers'][number]): void {
  const existing = activeTriggers.value;
  if (
    existing.some(
      (item) =>
        item.type === trigger.type &&
        item.absoluteTime === trigger.absoluteTime &&
        item.relativeValue === trigger.relativeValue &&
        item.relativeUnit === trigger.relativeUnit,
    )
  ) {
    return;
  }
  if (existing.length >= MAX_REMINDERS) return;
  emit('update:modelValue', {
    enabled: true,
    triggers: [...existing, trigger],
  });
}

function addRelative(value: number, unit: ReminderTimeUnit): void {
  appendTrigger({
    type: TaskReminderType.Relative,
    absoluteTime: null,
    relativeValue: value,
    relativeUnit: unit,
  });
}

function addAbsolute(value: number): void {
  const rounded = roundToMinute(value);
  if (!Number.isFinite(rounded) || rounded <= currentNow()) return;
  appendTrigger({
    type: TaskReminderType.Absolute,
    absoluteTime: rounded,
    relativeValue: null,
    relativeUnit: null,
  });
}
</script>
