<template>
  <section class="space-y-4">
    <div>
      <div class="mb-4">
        <div class="px-1 pb-1.5 text-xs text-muted-foreground">
          {{ t('task.timeConfig.timeType') }}
        </div>
        <div
          class="space-y-0.5"
          role="radiogroup"
          :aria-label="t('task.timeConfig.timeType')"
          data-testid="task-time-type-menu"
        >
          <Button
            v-for="option in timeTypeOptions"
            :key="option.value"
            type="button"
            variant="ghost"
            class="h-9 w-full justify-start gap-2 rounded-md px-2 font-normal"
            :class="timeType === option.value ? 'bg-accent text-accent-foreground' : ''"
            :disabled="isEditMode"
            role="radio"
            :aria-checked="timeType === option.value"
            :data-testid="`task-time-type-${option.value}`"
            @click="selectTimeType(option.value)"
          >
            <component :is="option.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1 text-left">{{ option.title }}</span>
            <Check
              class="h-4 w-4 shrink-0"
              :class="timeType === option.value ? 'opacity-100' : 'opacity-0'"
            />
          </Button>
        </div>
      </div>

      <!-- 日期范围 -->
      <div>
        <div>
          <Label for="task-start-date" class="mb-1.5 block">{{
            t('task.timeConfig.startDate')
          }}</Label>
          <ProductDatePicker
            v-model="startDateModel"
            variant="field"
            :label="t('task.timeConfig.startDate')"
            :placeholder="t('task.timeConfig.startDate')"
            :input-placeholder="t('common.productDateInputPlaceholder')"
            :format-hint="t('common.productDateInputHint')"
            :invalid-text="t('common.productDateInputInvalid')"
            :clear-label="t('common.clear')"
            test-id="task-start-date"
            :aria-label="t('task.timeConfig.startDate')"
            :disabled="isEditMode"
          />
        </div>
      </div>

      <!-- 时间点输入 (仅当选择 TimePoint 时显示) -->
      <div v-if="timeType === TaskTimeType.TimePoint" class="mt-4">
        <div>
          <Label id="task-specific-time-label" class="mb-1.5 block">{{
            t('task.timeConfig.specificTime')
          }}</Label>
          <div class="flex gap-2 items-center">
            <Select
              :model-value="timePointHour"
              @update:model-value="
                (v) => {
                  timePointHour = String(v);
                  rebuildTimePoint();
                }
              "
            >
              <SelectTrigger
                class="w-[80px]"
                :aria-label="`${t('task.timeConfig.specificTime')} - HH`"
                ><SelectValue placeholder="HH"
              /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="h in hourOptions" :key="h" :value="h">{{ h }}</SelectItem>
              </SelectContent>
            </Select>
            <span class="flex items-center font-medium">:</span>
            <Select
              :model-value="timePointMinute"
              @update:model-value="
                (v) => {
                  timePointMinute = String(v);
                  rebuildTimePoint();
                }
              "
            >
              <SelectTrigger
                class="w-[80px]"
                :aria-label="`${t('task.timeConfig.specificTime')} - MM`"
                ><SelectValue placeholder="MM"
              /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="m in minuteOptions" :key="m" :value="m">{{ m }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <!-- 时间段输入 (仅当选择 TimeRange 时显示) -->
      <div v-if="timeType === TaskTimeType.TimeRange" class="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label class="mb-1.5 block">{{ t('task.timeConfig.startTime') }}</Label>
          <div class="flex gap-2 items-center mt-2">
            <Select
              :model-value="timeRangeStartHour"
              @update:model-value="
                (v) => {
                  timeRangeStartHour = String(v);
                  rebuildTimeRange();
                }
              "
            >
              <SelectTrigger class="w-[80px]" :aria-label="`${t('task.timeConfig.startTime')} - HH`"
                ><SelectValue placeholder="HH"
              /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="h in hourOptions" :key="h" :value="h">{{ h }}</SelectItem>
              </SelectContent>
            </Select>
            <span class="flex items-center font-medium">:</span>
            <Select
              :model-value="timeRangeStartMinute"
              @update:model-value="
                (v) => {
                  timeRangeStartMinute = String(v);
                  rebuildTimeRange();
                }
              "
            >
              <SelectTrigger class="w-[80px]" :aria-label="`${t('task.timeConfig.startTime')} - MM`"
                ><SelectValue placeholder="MM"
              /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="m in minuteOptions" :key="m" :value="m">{{ m }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label class="mb-1.5 block">{{ t('task.timeConfig.endTime') }}</Label>
          <div class="flex gap-2 items-center mt-2">
            <Select
              :model-value="timeRangeEndHour"
              @update:model-value="
                (v) => {
                  timeRangeEndHour = String(v);
                  rebuildTimeRange();
                }
              "
            >
              <SelectTrigger class="w-[80px]" :aria-label="`${t('task.timeConfig.endTime')} - HH`"
                ><SelectValue placeholder="HH"
              /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="h in hourOptions" :key="h" :value="h">{{ h }}</SelectItem>
              </SelectContent>
            </Select>
            <span class="flex items-center font-medium">:</span>
            <Select
              :model-value="timeRangeEndMinute"
              @update:model-value="
                (v) => {
                  timeRangeEndMinute = String(v);
                  rebuildTimeRange();
                }
              "
            >
              <SelectTrigger class="w-[80px]" :aria-label="`${t('task.timeConfig.endTime')} - MM`"
                ><SelectValue placeholder="MM"
              /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="m in minuteOptions" :key="m" :value="m">{{ m }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <!-- 验证提示 -->
      <Alert v-if="validationError" variant="destructive" class="mt-2">
        <AlertDescription>{{ validationError }}</AlertDescription>
      </Alert>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { TaskPlanScheduleSchema, TaskTimingSchema } from '@memoflow/contracts/task';
import type { TaskPlanSchedule, TaskTiming } from '@memoflow/contracts/task';
import type { TaskPlanViewModel } from '../../types';
import {
  Button,
  Label,
  Alert,
  AlertDescription,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@memoflow/ui-vue-shadcn';
import { translateResultError } from '../../../../../shared/utils/translate-result-error';
import { padTwoDigits } from '../../../../../shared/utils/pad-two-digits';
import { ProductDatePicker } from '../../../../../shared/components';
import { CalendarDays, Check, Clock3, Timer } from '@lucide/vue';
import { requireYmd, type Ymd } from '@memoflow/contracts/primitives';

const { t } = useI18n();

const TaskTimeType = {
  AllDay: 'AllDay',
  TimePoint: 'TimePoint',
  TimeRange: 'TimeRange',
} as const;
type TaskTimeType = (typeof TaskTimeType)[keyof typeof TaskTimeType];

const props = withDefaults(
  defineProps<{
    modelValue: TaskPlanViewModel;
    isEditMode?: boolean;
  }>(),
  { isEditMode: false },
);

const isEditMode = props.isEditMode;
const emit = defineEmits<{
  (e: 'update:modelValue', value: TaskPlanViewModel): void;
  (e: 'update:validation', valid: boolean): void;
}>();

const hourOptions = Array.from({ length: 24 }, (_, i) => padTwoDigits(i));
const minuteOptions = Array.from({ length: 60 }, (_, i) => padTwoDigits(i));
const timeType = ref<TaskTimeType>(TaskTimeType.AllDay);
const timeTypeOptions = computed(() => [
  {
    value: TaskTimeType.AllDay,
    title: t('task.timeConfig.allDay'),
    icon: CalendarDays,
  },
  {
    value: TaskTimeType.TimePoint,
    title: t('task.timeConfig.timePoint'),
    icon: Clock3,
  },
  {
    value: TaskTimeType.TimeRange,
    title: t('task.timeConfig.timeRange'),
    icon: Timer,
  },
]);
const startDate = ref('');
const startDateModel = computed<Ymd | null>({
  get: () => (startDate.value ? requireYmd(startDate.value) : null),
  set: (value) => {
    startDate.value = value ?? '';
    handleDateChange();
  },
});
type ValidationErrorState =
  { kind: 'translation'; key: string } | { kind: 'result'; cause: unknown };
const validationErrorState = shallowRef<ValidationErrorState | null>(null);
const validationError = computed(() => {
  const state = validationErrorState.value;
  if (!state) return '';
  return state.kind === 'translation'
    ? t(state.key)
    : translateResultError(state.cause, t, { fallbackKey: 'task.timeConfig.updateFailed' });
});

const timePointHour = ref('00');
const timePointMinute = ref('00');
const timeRangeStartHour = ref('00');
const timeRangeStartMinute = ref('00');
const timeRangeEndHour = ref('00');
const timeRangeEndMinute = ref('00');

function splitHm(value: string): { hour: string; minute: string } {
  const [hour = '00', minute = '00'] = value.split(':');
  return { hour, minute };
}

function currentSchedule(): TaskPlanSchedule {
  return TaskPlanScheduleSchema.parse(props.modelValue.schedule);
}

function currentDate(schedule = currentSchedule()): string {
  return schedule.kind === 'OneTime' ? String(schedule.date) : String(schedule.startDate);
}

function buildTiming(): TaskTiming {
  if (timeType.value === TaskTimeType.TimePoint) {
    return TaskTimingSchema.parse({
      kind: 'At',
      time: `${timePointHour.value}:${timePointMinute.value}`,
    });
  }
  if (timeType.value === TaskTimeType.TimeRange) {
    return TaskTimingSchema.parse({
      kind: 'Window',
      start: `${timeRangeStartHour.value}:${timeRangeStartMinute.value}`,
      end: `${timeRangeEndHour.value}:${timeRangeEndMinute.value}`,
    });
  }
  return { kind: 'AllDay' };
}

function emitSchedule(next: { date?: string; timing?: TaskTiming }): void {
  try {
    validationErrorState.value = null;
    const schedule = currentSchedule();
    const date = next.date ?? currentDate(schedule);
    const timing = next.timing ?? schedule.timing;
    const updatedSchedule =
      schedule.kind === 'OneTime'
        ? TaskPlanScheduleSchema.parse({ ...schedule, date, timing })
        : TaskPlanScheduleSchema.parse({ ...schedule, startDate: date, timing });
    emit('update:modelValue', { ...props.modelValue, schedule: updatedSchedule });
    emit('update:validation', true);
  } catch (error) {
    validationErrorState.value = { kind: 'result', cause: error };
    emit('update:validation', false);
  }
}

function initializeFormData(): void {
  const schedule = currentSchedule();
  startDate.value = currentDate(schedule);
  const timing = schedule.timing;
  if (timing.kind === 'At') {
    timeType.value = TaskTimeType.TimePoint;
    const parts = splitHm(timing.time);
    timePointHour.value = parts.hour;
    timePointMinute.value = parts.minute;
    return;
  }
  if (timing.kind === 'Window') {
    timeType.value = TaskTimeType.TimeRange;
    const start = splitHm(timing.start);
    const end = splitHm(timing.end);
    timeRangeStartHour.value = start.hour;
    timeRangeStartMinute.value = start.minute;
    timeRangeEndHour.value = end.hour;
    timeRangeEndMinute.value = end.minute;
    return;
  }
  timeType.value = TaskTimeType.AllDay;
}

function handleDateChange(): void {
  emitSchedule({ date: startDate.value });
}

function rebuildTimePoint(): void {
  emitSchedule({ timing: buildTiming() });
}

function rebuildTimeRange(): void {
  const start = `${timeRangeStartHour.value}:${timeRangeStartMinute.value}`;
  const end = `${timeRangeEndHour.value}:${timeRangeEndMinute.value}`;
  if (end <= start) {
    validationErrorState.value = { kind: 'translation', key: 'task.timeConfig.endBeforeStart' };
    emit('update:validation', false);
    return;
  }
  emitSchedule({ timing: buildTiming() });
}

function selectTimeType(value: TaskTimeType): void {
  if (isEditMode || timeType.value === value) return;
  timeType.value = value;
  handleTimeTypeChange();
}

function handleTimeTypeChange(): void {
  if (timeType.value === TaskTimeType.TimePoint) {
    timePointHour.value = '00';
    timePointMinute.value = '00';
  } else if (timeType.value === TaskTimeType.TimeRange) {
    timeRangeStartHour.value = '00';
    timeRangeStartMinute.value = '00';
    timeRangeEndHour.value = '01';
    timeRangeEndMinute.value = '00';
  }
  emitSchedule({ timing: buildTiming() });
}

onMounted(initializeFormData);
watch(
  () => props.modelValue.schedule,
  () => initializeFormData(),
  { deep: true },
);
</script>
