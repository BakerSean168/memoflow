<!--
  RecurrenceSection.vue
  任务模板重复规则配置部分
  使用 RecurrenceRule 值对象
-->
<template>
  <section class="space-y-4" aria-labelledby="task-recurrence-heading">
    <header class="flex items-center gap-2">
      <Repeat class="h-5 w-5 text-primary" />
      <h3 id="task-recurrence-heading" class="text-sm font-semibold">
        {{ t('task.recurrence.title') }}
      </h3>
    </header>
    <div>
      <!-- 显示验证错误 -->
      <Alert v-if="validationErrors.length > 0" variant="destructive" class="mb-4">
        <AlertDescription>
          <ul class="mb-0">
            <li v-for="error in validationErrors" :key="error">{{ error }}</li>
          </ul>
        </AlertDescription>
      </Alert>

      <!-- 显示规则描述 -->
      <Alert v-if="isValid && hasRecurrence" class="mb-4">
        <Info class="h-4 w-4" />
        <AlertDescription>
          {{ t('task.recurrence.currentSetting') }}{{ recurrenceDescription }}
        </AlertDescription>
      </Alert>

      <div class="grid grid-cols-12 gap-4">
        <!-- 是否启用重复 -->
        <div class="col-span-12">
          <div class="flex items-center gap-2">
            <Switch
              id="task-recurrence-enabled"
              :model-value="recurrenceEnabled"
              @update:model-value="recurrenceEnabled = $event"
            />
            <Label for="task-recurrence-enabled">{{ t('task.recurrence.enable') }}</Label>
          </div>
        </div>

        <template v-if="recurrenceEnabled">
          <!-- 重复频率 -->
          <div class="col-span-12 md:col-span-6">
            <Label for="task-recurrence-frequency" class="mb-2 block">{{
              t('task.recurrence.frequency')
            }}</Label>
            <Select
              :model-value="frequency"
              @update:model-value="frequency = $event as RecurrenceFrequency"
            >
              <SelectTrigger
                id="task-recurrence-frequency"
                :aria-label="t('task.recurrence.frequency')"
              >
                <SelectValue :placeholder="t('task.recurrence.selectFrequency')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in frequencyOptions" :key="opt.value" :value="opt.value">
                  {{ opt.title }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- 重复间隔 -->
          <div class="col-span-12 md:col-span-6">
            <Label for="task-recurrence-interval" class="mb-2 block">{{
              t('task.recurrence.interval')
            }}</Label>
            <Input
              id="task-recurrence-interval"
              :model-value="interval"
              type="number"
              min="1"
              max="365"
              @update:model-value="interval = Number($event)"
            />
            <p class="text-xs text-muted-foreground mt-1">{{ intervalHint }}</p>
          </div>

          <!-- 每周重复：选择星期几 -->
          <div class="col-span-12" v-if="frequency === RecurrenceFrequency.Weekly">
            <div class="text-sm font-medium mb-2">{{ t('task.recurrence.selectDay') }}</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="day in dayOptions"
                :key="day.value"
                type="button"
                role="checkbox"
                :aria-checked="selectedDays.includes(day.value)"
                class="h-8 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :class="
                  selectedDays.includes(day.value)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background hover:bg-accent'
                "
                @click="toggleDay(day.value)"
              >
                {{ day.title }}
              </button>
            </div>
          </div>

          <!-- 结束条件 -->
          <div class="col-span-12">
            <Separator class="my-2" />
            <div class="text-sm font-medium mb-2">{{ t('task.recurrence.endCondition') }}</div>
          </div>

          <div class="col-span-12 md:col-span-4">
            <RadioGroup
              :aria-label="t('task.recurrence.endCondition')"
              :model-value="endConditionType"
              @update:model-value="endConditionType = $event as 'never' | 'date' | 'count'"
            >
              <div class="flex items-center gap-2">
                <RadioGroupItem value="never" id="end-never" />
                <Label for="end-never">{{ t('task.recurrence.never') }}</Label>
              </div>
              <div class="flex items-center gap-2">
                <RadioGroupItem value="date" id="end-date" />
                <Label for="end-date">{{ t('task.recurrence.endDate') }}</Label>
              </div>
              <div class="flex items-center gap-2">
                <RadioGroupItem value="count" id="end-count" />
                <Label for="end-count">{{ t('task.recurrence.countLimit') }}</Label>
              </div>
            </RadioGroup>
          </div>

          <div class="col-span-12 md:col-span-8">
            <!-- 结束日期 -->
            <div v-if="endConditionType === 'date'">
              <Label for="task-recurrence-end-date" class="mb-2 block">{{
                t('task.recurrence.endDate')
              }}</Label>
              <Popover>
                <PopoverTrigger as-child>
                  <Button
                    id="task-recurrence-end-date"
                    :aria-label="t('task.recurrence.endDate')"
                    variant="outline"
                    class="w-full justify-start text-left font-normal"
                    :class="{ 'text-muted-foreground': !endDate }"
                  >
                    <CalendarIcon class="mr-2 h-4 w-4" />
                    {{
                      endDate
                        ? formatDisplayDate(endDate, locale)
                        : t('task.recurrence.selectEndDate')
                    }}
                  </Button>
                </PopoverTrigger>
                <PopoverContent class="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    :selected="endDateAsDate"
                    @update:model-value="handleEndDateCalendarSelect"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <!-- 次数限制 -->
            <div v-if="endConditionType === 'count'">
              <Label for="task-recurrence-count" class="mb-2 block">{{
                t('task.recurrence.count')
              }}</Label>
              <Input
                id="task-recurrence-count"
                :model-value="occurrences"
                type="number"
                min="1"
                max="999"
                @update:model-value="occurrences = Number($event)"
              />
            </div>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  RecurrenceFrequency,
  DayOfWeek,
  RECURRENCE_RULE_DEFAULTS,
  TaskPlanScheduleSchema,
  TaskYmdSchema,
} from '@memoflow/contracts/task';
import type { TaskPlanSchedule, TaskRecurrence, TaskRecurrenceEnd } from '@memoflow/contracts/task';
import type { TaskPlanViewModel } from '../../types';
import {
  Alert,
  AlertDescription,
  Switch,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Input,
  Button,
  Separator,
  RadioGroup,
  RadioGroupItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Calendar,
} from '@memoflow/ui-vue-shadcn';
import { Repeat, Info, Calendar as CalendarIcon } from '@lucide/vue';
import { formatDisplayDate } from '../../../../../shared/utils/format-display-date';
import { handleCalendarSelect } from '../../../../../shared/utils/handle-calendar-select';
import { getProductTime } from '../../../../../shared/utils/product-time';
import { addYmdDays } from '@memoflow/time';

const { t, locale } = useI18n();
const props = defineProps<{ modelValue: TaskPlanViewModel }>();
const emit = defineEmits<{
  'update:modelValue': [value: TaskPlanViewModel];
  'update:validation': [isValid: boolean];
}>();

function schedule(): TaskPlanSchedule {
  return TaskPlanScheduleSchema.parse(props.modelValue.schedule);
}

function emitSchedule(next: TaskPlanSchedule): void {
  emit('update:modelValue', { ...props.modelValue, schedule: TaskPlanScheduleSchema.parse(next) });
}

function defaultRecurrence(): TaskRecurrence {
  return {
    frequency: RecurrenceFrequency.Daily,
    interval: 1,
    byWeekday: [],
    end: { kind: 'Never' },
  };
}

const recurrenceEnabled = computed({
  get: () => schedule().kind === 'Recurring',
  set: (enabled: boolean) => {
    const current = schedule();
    if (enabled && current.kind === 'OneTime') {
      emitSchedule({
        kind: 'Recurring',
        startDate: current.date,
        timing: current.timing,
        recurrence: defaultRecurrence(),
      });
    } else if (!enabled && current.kind === 'Recurring') {
      emitSchedule({ kind: 'OneTime', date: current.startDate, timing: current.timing });
    }
  },
});

function recurrence(): TaskRecurrence {
  const current = schedule();
  return current.kind === 'Recurring' ? current.recurrence : defaultRecurrence();
}

function updateRecurrence(updates: Partial<TaskRecurrence>): void {
  const current = schedule();
  if (current.kind !== 'Recurring') return;
  emitSchedule({
    ...current,
    recurrence: {
      ...current.recurrence,
      ...updates,
      byWeekday: updates.byWeekday ?? current.recurrence.byWeekday,
      end: updates.end ?? current.recurrence.end,
    },
  });
}

const frequencyOptions = computed(() => [
  { title: t('task.recurrence.daily'), value: RecurrenceFrequency.Daily },
  { title: t('task.recurrence.weekly'), value: RecurrenceFrequency.Weekly },
  { title: t('task.recurrence.monthly'), value: RecurrenceFrequency.Monthly },
  { title: t('task.recurrence.yearly'), value: RecurrenceFrequency.Yearly },
]);
const dayOptions = computed(() => [
  { title: t('task.recurrence.sun'), value: DayOfWeek.Sunday },
  { title: t('task.recurrence.mon'), value: DayOfWeek.Monday },
  { title: t('task.recurrence.tue'), value: DayOfWeek.Tuesday },
  { title: t('task.recurrence.wed'), value: DayOfWeek.Wednesday },
  { title: t('task.recurrence.thu'), value: DayOfWeek.Thursday },
  { title: t('task.recurrence.fri'), value: DayOfWeek.Friday },
  { title: t('task.recurrence.sat'), value: DayOfWeek.Saturday },
]);

const frequency = computed({
  get: () => recurrence().frequency,
  set: (value: RecurrenceFrequency) => {
    updateRecurrence({
      frequency: value,
      byWeekday:
        value === RecurrenceFrequency.Weekly
          ? recurrence().byWeekday.length > 0
            ? recurrence().byWeekday
            : [DayOfWeek.Monday]
          : [],
    });
  },
});
const interval = computed({
  get: () => recurrence().interval,
  set: (value: number) => updateRecurrence({ interval: value }),
});
const selectedDays = computed({
  get: () => [...recurrence().byWeekday],
  set: (value: DayOfWeek[]) => updateRecurrence({ byWeekday: value }),
});
function toggleDay(day: DayOfWeek): void {
  const current = selectedDays.value;
  selectedDays.value = current.includes(day)
    ? current.filter((candidate) => candidate !== day)
    : [...current, day];
}

const endConditionType = ref<'never' | 'date' | 'count'>('never');
const endDate = ref('');
const occurrences = ref(1);
const endDateAsDate = computed(() =>
  endDate.value ? new Date(`${endDate.value}T00:00:00`) : undefined,
);
function handleEndDateCalendarSelect(date: unknown): void {
  handleCalendarSelect(date, (value) => {
    endDate.value = value;
  });
}
function getDefaultEndDate(): string {
  return String(
    addYmdDays(
      getProductTime().calendar.toYmd(Date.now()),
      RECURRENCE_RULE_DEFAULTS.DEFAULT_END_DATE_DAYS,
    ),
  );
}
function endFromForm(): TaskRecurrenceEnd {
  if (endConditionType.value === 'date') {
    return { kind: 'Until', date: TaskYmdSchema.parse(endDate.value) };
  }
  if (endConditionType.value === 'count') return { kind: 'Count', count: occurrences.value };
  return { kind: 'Never' };
}
function initializeEndCondition(): void {
  const end = recurrence().end;
  if (end.kind === 'Until') {
    endConditionType.value = 'date';
    endDate.value = String(end.date);
  } else if (end.kind === 'Count') {
    endConditionType.value = 'count';
    occurrences.value = end.count;
  } else {
    endConditionType.value = 'never';
  }
}
watch(endConditionType, (kind) => {
  if (!recurrenceEnabled.value) return;
  if (kind === 'date' && !endDate.value) endDate.value = getDefaultEndDate();
  if (kind === 'count' && occurrences.value < 1) {
    occurrences.value = RECURRENCE_RULE_DEFAULTS.DEFAULT_OCCURRENCES;
  }
  updateRecurrence({ end: endFromForm() });
});
watch(endDate, (value) => {
  if (recurrenceEnabled.value && endConditionType.value === 'date' && value) {
    updateRecurrence({ end: { kind: 'Until', date: TaskYmdSchema.parse(value) } });
  }
});
watch(occurrences, (value) => {
  if (recurrenceEnabled.value && endConditionType.value === 'count' && value > 0) {
    updateRecurrence({ end: { kind: 'Count', count: value } });
  }
});

const intervalHint = computed(() => {
  switch (frequency.value) {
    case RecurrenceFrequency.Daily:
      return t('task.recurrence.intervalHintDay');
    case RecurrenceFrequency.Weekly:
      return t('task.recurrence.intervalHintWeek');
    case RecurrenceFrequency.Monthly:
      return t('task.recurrence.intervalHintMonth');
    case RecurrenceFrequency.Yearly:
      return t('task.recurrence.intervalHintYear');
    default:
      return '';
  }
});
const hasRecurrence = computed(() => recurrenceEnabled.value);
const recurrenceDescription = computed(() => {
  if (!recurrenceEnabled.value) return '';
  return t('task.recurrence.description', {
    interval: recurrence().interval,
    unit: intervalHint.value,
  });
});
const validationErrors = computed(() => {
  if (!recurrenceEnabled.value) return [];
  const rule = recurrence();
  const errors: string[] = [];
  if (rule.interval < 1 || rule.interval > 365) errors.push(t('task.recurrence.intervalRange'));
  if (rule.frequency === RecurrenceFrequency.Weekly && rule.byWeekday.length === 0) {
    errors.push(t('task.recurrence.weekdayRequired'));
  }
  if (rule.end.kind === 'Until' && !rule.end.date) errors.push(t('task.recurrence.selectEndDate'));
  if (rule.end.kind === 'Count' && rule.end.count < 1)
    errors.push(t('task.recurrence.countPositive'));
  return errors;
});
const isValid = computed(() => validationErrors.value.length === 0);
watch(isValid, (value) => emit('update:validation', value), { immediate: true });
watch(
  () => props.modelValue.schedule,
  () => initializeEndCondition(),
  { deep: true, immediate: true },
);
</script>
