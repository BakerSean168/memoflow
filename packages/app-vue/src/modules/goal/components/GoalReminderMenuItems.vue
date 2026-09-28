<template>
  <DropdownMenuItem :disabled="addDisabled" @select.prevent="setAbsoluteAt(oneHourPreset)">
    <Clock3 class="mr-2 h-4 w-4 text-muted-foreground" />
    <span class="min-w-0 flex-1">{{ t('goal.reminder.inOneHour') }}</span>
    <span class="ml-4 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
      {{ formatProductDateTime(oneHourPreset) }}
    </span>
  </DropdownMenuItem>

  <DropdownMenuItem :disabled="addDisabled" @select.prevent="setAbsoluteAt(tomorrowPreset)">
    <Sunrise class="mr-2 h-4 w-4 text-muted-foreground" />
    <span class="min-w-0 flex-1">{{ t('goal.reminder.tomorrow') }}</span>
    <span class="ml-4 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
      {{ formatProductDateTime(tomorrowPreset) }}
    </span>
  </DropdownMenuItem>

  <DropdownMenuItem :disabled="addDisabled" @select.prevent="setAbsoluteAt(nextWeekPreset)">
    <CalendarDays class="mr-2 h-4 w-4 text-muted-foreground" />
    <span class="min-w-0 flex-1">{{ t('goal.reminder.nextWeek') }}</span>
    <span class="ml-4 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
      {{ formatProductDateTime(nextWeekPreset) }}
    </span>
  </DropdownMenuItem>

  <DropdownMenuItem :disabled="addDisabled" @select.prevent="setAbsoluteAt(nextMonthPreset)">
    <CalendarRange class="mr-2 h-4 w-4 text-muted-foreground" />
    <span class="min-w-0 flex-1">{{ t('goal.reminder.nextMonth') }}</span>
    <span class="ml-4 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
      {{ formatProductDateTime(nextMonthPreset) }}
    </span>
  </DropdownMenuItem>

  <DropdownMenuItem :disabled="addDisabled" @click="emit('request-custom-time')">
    <CalendarClock class="mr-2 h-4 w-4 text-muted-foreground" />
    {{ t('goal.reminder.customTime') }}
  </DropdownMenuItem>

  <DropdownMenuSeparator />

  <DropdownMenuSub>
    <DropdownMenuSubTrigger :disabled="addDisabled || !target">
      <Target class="mr-2 h-4 w-4 text-muted-foreground" />
      {{ t('goal.reminder.relativeToTarget') }}
    </DropdownMenuSubTrigger>
    <DropdownMenuSubContent class="w-96 max-w-[calc(100vw-2rem)]">
      <DropdownMenuItem :disabled="!canSetRemainingDays(0)" @select.prevent="setRemainingDays(0)">
        <span class="min-w-0 flex-1">{{ t('goal.reminder.onTargetDay') }}</span>
        <span class="ml-4 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {{ formatProductDateTime(remainingDaysInstant(0)) }}
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem :disabled="!canSetRemainingDays(1)" @select.prevent="setRemainingDays(1)">
        <span class="min-w-0 flex-1">{{ t('goal.reminder.oneDayBefore') }}</span>
        <span class="ml-4 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {{ formatProductDateTime(remainingDaysInstant(1)) }}
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem :disabled="!canSetRemainingDays(3)" @select.prevent="setRemainingDays(3)">
        <span class="min-w-0 flex-1">{{ t('goal.reminder.threeDaysBefore') }}</span>
        <span class="ml-4 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {{ formatProductDateTime(remainingDaysInstant(3)) }}
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem :disabled="!canSetRemainingDays(7)" @select.prevent="setRemainingDays(7)">
        <span class="min-w-0 flex-1">{{ t('goal.reminder.oneWeekBefore') }}</span>
        <span class="ml-4 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {{ formatProductDateTime(remainingDaysInstant(7)) }}
        </span>
      </DropdownMenuItem>
    </DropdownMenuSubContent>
  </DropdownMenuSub>

  <template v-if="atLimit">
    <DropdownMenuSeparator />
    <DropdownMenuItem disabled>
      {{ t('goal.reminder.maxRemindersReached') }}
    </DropdownMenuItem>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CalendarClock, CalendarDays, CalendarRange, Clock3, Sunrise, Target } from '@lucide/vue';
import type { Ymd } from '@memoflow/contracts/primitives';
import {
  ReminderTriggerType,
  goalTimeframeEndBoundary,
  goalTimeframeStartBoundary,
  type GoalReminderConfigDTO,
  type GoalTimeframe,
} from '@memoflow/contracts/goal';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@memoflow/ui-vue-shadcn';
import { addYmdDays } from '@memoflow/time';
import {
  formatProductDateTime,
  getProductTime,
  getProductTodayYmd,
  productTimeRevision,
} from '../../../shared/utils/product-time';

const props = withDefaults(
  defineProps<{
    modelValue: GoalReminderConfigDTO | null;
    start: GoalTimeframe | null;
    target: GoalTimeframe | null;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  'update:modelValue': [GoalReminderConfigDTO | null];
  'request-custom-time': [];
}>();
const { t } = useI18n();

const MAX_REMINDERS = 10;

function currentNow(): number {
  return Number(getProductTime().now());
}

function roundToMinute(value: number): number {
  return Math.floor(value / 60_000) * 60_000;
}

function oneHourFromNow(): number {
  return roundToMinute(currentNow() + 60 * 60 * 1000);
}

const oneHourPreset = computed(() => {
  void productTimeRevision.value;
  return oneHourFromNow();
});

function atMorning(daysFromToday: number): number {
  const day = addYmdDays(getProductTodayYmd(), daysFromToday);
  return Number(getProductTime().input.combine(day, '09:00') ?? currentNow());
}

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

function tomorrowMorning(): number {
  return atMorning(1);
}

function nextWeekMorning(): number {
  return atMorning(7);
}

function nextMonthMorning(): number {
  const day = addOneCalendarMonth(getProductTodayYmd());
  return Number(getProductTime().input.combine(day, '09:00') ?? currentNow());
}

const tomorrowPreset = computed(() => {
  void productTimeRevision.value;
  return tomorrowMorning();
});
const nextWeekPreset = computed(() => {
  void productTimeRevision.value;
  return nextWeekMorning();
});
const nextMonthPreset = computed(() => {
  void productTimeRevision.value;
  return nextMonthMorning();
});
const activeTriggers = computed(() =>
  (props.modelValue?.triggers ?? []).filter((trigger) => trigger.enabled),
);
const pendingTriggers = computed(() =>
  activeTriggers.value.filter((trigger) => {
    if (trigger.type === ReminderTriggerType.AbsoluteAt) {
      return trigger.value > currentNow();
    }
    if (trigger.type === ReminderTriggerType.RemainingDays) {
      return isRemainingDaysScheduleValid(trigger.value);
    }
    return true;
  }),
);
const atLimit = computed(() => pendingTriggers.value.length >= MAX_REMINDERS);
const addDisabled = computed(() => props.disabled || atLimit.value);

function appendTrigger(
  type: (typeof ReminderTriggerType)[keyof typeof ReminderTriggerType],
  value: number,
): void {
  const existing = pendingTriggers.value;
  if (existing.some((trigger) => trigger.type === type && trigger.value === value)) return;
  if (existing.length >= MAX_REMINDERS) return;

  emit('update:modelValue', {
    enabled: true,
    triggers: [...existing, { type, value, enabled: true }],
  });
}

function setAbsoluteAt(value: number): void {
  if (!Number.isFinite(value) || value <= currentNow()) return;
  appendTrigger(ReminderTriggerType.AbsoluteAt, roundToMinute(value));
}

function remainingDaysInstant(days: number): number | null {
  void productTimeRevision.value;
  if (!props.target) return null;
  const reminderDay = addYmdDays(goalTimeframeEndBoundary(props.target), -days);
  const reminderAt = getProductTime().input.combine(reminderDay, '09:00');
  return reminderAt == null ? null : Number(reminderAt);
}

function isRemainingDaysScheduleValid(days: number): boolean {
  if (!props.target) return false;
  const reminderDay = addYmdDays(goalTimeframeEndBoundary(props.target), -days);
  if (props.start && reminderDay < goalTimeframeStartBoundary(props.start)) return false;
  const reminderAt = remainingDaysInstant(days);
  return reminderAt != null && reminderAt > currentNow();
}

function canSetRemainingDays(days: number): boolean {
  return !addDisabled.value && isRemainingDaysScheduleValid(days);
}

function setRemainingDays(days: number): void {
  if (!canSetRemainingDays(days)) return;
  appendTrigger(ReminderTriggerType.RemainingDays, days);
}
</script>
