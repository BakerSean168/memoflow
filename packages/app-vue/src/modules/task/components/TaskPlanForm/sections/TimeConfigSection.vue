<template>
  <section class="space-y-4" aria-labelledby="task-time-config-heading">
    <h3 id="task-time-config-heading" class="flex items-center text-sm font-semibold">
      <Clock3 class="mr-2 h-5 w-5" />
      {{ t('task.timeConfig.title') }}
    </h3>
    <div>
      <!-- 时间类型选择 -->
      <div class="mb-4">
        <Label class="mb-2 block">{{ t('task.timeConfig.timeType') }}</Label>
        <RadioGroup
          :aria-label="t('task.timeConfig.timeType')"
          :model-value="timeType"
          @update:model-value="
            (v) => {
              if (isEditMode || typeof v !== 'string') return;
              timeType = v as TaskTimeType;
              handleTimeTypeChange();
            }
          "
        >
          <div class="flex items-center space-x-2">
            <RadioGroupItem :value="TaskTimeType.AllDay" id="time-all-day" :disabled="isEditMode" />
            <Label for="time-all-day">{{ t('task.timeConfig.allDay') }}</Label>
          </div>
          <div class="flex items-center space-x-2">
            <RadioGroupItem
              :value="TaskTimeType.TimePoint"
              id="time-point"
              :disabled="isEditMode"
            />
            <Label for="time-point">{{ t('task.timeConfig.timePoint') }}</Label>
          </div>
          <div class="flex items-center space-x-2">
            <RadioGroupItem
              :value="TaskTimeType.TimeRange"
              id="time-range"
              :disabled="isEditMode"
            />
            <Label for="time-range">{{ t('task.timeConfig.timeRange') }}</Label>
          </div>
        </RadioGroup>
        <p v-if="isEditMode" class="mt-1 text-xs text-muted-foreground">
          {{ t('task.timeConfig.timeTypeFixedHint') }}
        </p>
      </div>

      <!-- 日期范围 -->
      <div class="grid grid-cols-12 gap-4">
        <div class="col-span-12 md:col-span-6">
          <Label for="task-start-date" class="mb-1.5 block">{{
            t('task.timeConfig.startDate')
          }}</Label>
          <Button
            v-if="isEditMode"
            id="task-start-date"
            :aria-label="t('task.timeConfig.startDate')"
            variant="outline"
            class="w-full justify-start text-left font-normal"
            :class="{ 'text-muted-foreground': !startDate }"
            disabled
          >
            <CalendarIcon class="mr-2 h-4 w-4" />
            {{ startDate ? formatDisplayDate(startDate, locale) : t('task.timeConfig.startDate') }}
          </Button>
          <Popover v-else>
            <PopoverTrigger as-child>
              <Button
                id="task-start-date"
                :aria-label="t('task.timeConfig.startDate')"
                variant="outline"
                class="w-full justify-start text-left font-normal"
                :class="{ 'text-muted-foreground': !startDate }"
              >
                <CalendarIcon class="mr-2 h-4 w-4" />
                {{
                  startDate ? formatDisplayDate(startDate, locale) : t('task.timeConfig.startDate')
                }}
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-auto p-0" align="start">
              <Calendar
                mode="single"
                :selected="parseToCalendarDate(startDate)"
                @update:model-value="
                  (d: unknown) =>
                    handleCalendarSelect(d, (v) => {
                      startDate = v;
                      handleDateChange();
                    })
                "
              />
            </PopoverContent>
          </Popover>
          <p v-if="isEditMode" class="mt-1 text-xs text-muted-foreground">
            {{ t('task.timeConfig.startDateFixedHint') }}
          </p>
        </div>
      </div>

      <!-- 时间点输入 (仅当选择 TimePoint 时显示) -->
      <div v-if="timeType === TaskTimeType.TimePoint" class="grid grid-cols-12 gap-4 mt-4">
        <div class="col-span-12 md:col-span-6">
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
          <p class="text-xs text-muted-foreground mt-1">{{ t('task.timeConfig.enterTime') }}</p>
        </div>
      </div>

      <!-- 时间段输入 (仅当选择 TimeRange 时显示) -->
      <div v-if="timeType === TaskTimeType.TimeRange" class="grid grid-cols-12 gap-4 mt-4">
        <div class="col-span-12 md:col-span-6">
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
        <div class="col-span-12 md:col-span-6">
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
        <div class="col-span-12">
          <p class="text-xs text-muted-foreground">{{ t('task.timeConfig.enterFullRange') }}</p>
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
import { TaskTimeType } from '@memoflow/contracts/task';
import type { TaskTimeConfigDTO } from '@memoflow/contracts/task';
import type { TaskPlanViewModel } from '../../types';
import {
  Button,
  Label,
  RadioGroup,
  RadioGroupItem,
  Alert,
  AlertDescription,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Calendar,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@memoflow/ui-vue-shadcn';
import { Calendar as CalendarIcon, Clock3 } from '@lucide/vue';
import { translateResultError } from '../../../../../shared/utils/translate-result-error';
import { getProductTime } from '../../../../../shared/utils/product-time';
import { parseToCalendarDate } from '../../../../../shared/utils/parse-to-date';
import { handleCalendarSelect } from '../../../../../shared/utils/handle-calendar-select';
import { formatDisplayDate } from '../../../../../shared/utils/format-display-date';
import { padTwoDigits } from '../../../../../shared/utils/pad-two-digits';

const { t, locale } = useI18n();

// TIME-1206: date-only display stays on the Ymd helper; calendar selection uses the CalendarDate <-> Ymd boundary without Date conversion.

const props = withDefaults(
  defineProps<{
    modelValue: TaskPlanViewModel;
    isEditMode?: boolean;
  }>(),
  {
    isEditMode: false,
  },
);

const isEditMode = props.isEditMode;

const emit = defineEmits<{
  (e: 'update:modelValue', value: TaskPlanViewModel): void;
  (e: 'update:validation', valid: boolean): void;
}>();

// ── Time picker options ────────────────────────────────────────────────
/** Residual 1312: hour/minute option pad dual retired onto padTwoDigits sole. */
const hourOptions = Array.from({ length: 24 }, (_, i) => padTwoDigits(i));
const minuteOptions = Array.from({ length: 60 }, (_, i) => padTwoDigits(i));

// ── Form data ──────────────────────────────────────────────────────────
const timeType = ref<TaskTimeType>(TaskTimeType.AllDay);
const startDate = ref<string>(''); // YYYY-MM-DD
type ValidationErrorState =
  { kind: 'translation'; key: string } | { kind: 'result'; cause: unknown };
const validationErrorState = shallowRef<ValidationErrorState | null>(null);
const validationError = computed(() => {
  const state = validationErrorState.value;
  if (!state) return '';
  return state.kind === 'translation' ? t(state.key) : getTimeConfigErrorMessage(state.cause);
});

// TimePoint: split into hour + minute
const timePointHour = ref<string>('00');
const timePointMinute = ref<string>('00');

// TimeRange start: split into hour + minute
const timeRangeStartHour = ref<string>('00');
const timeRangeStartMinute = ref<string>('00');

// TimeRange end: split into hour + minute
const timeRangeEndHour = ref<string>('00');
const timeRangeEndMinute = ref<string>('00');

// ── Helpers ────────────────────────────────────────────────────────────

/** Format a YYYY-MM-DD string for display */
/** Convert a YYYY-MM-DD string to a Date for Calendar :selected */
/** Handle Calendar selection — works with both Date and radix DateValue objects */
/**
 * Residual 1210: task formatDateToInput — epoch ms → local YMD via @memoflow/time.
 * Soft residual 1210 retired: utils Date bridge deleted (ADR-037 T9).
 */
const formatDateToInput = (timestamp: number): string => {
  return getProductTime().input.dateValue(timestamp);
};

/**
 * Residual 1225 keep-boundary: app-vue task parseDateInput — YMD string → epoch ms (no trim/NaN guard).
 * Task time-config form helper; falsy empty → null; product-time parseDateValue + startOfYmd.
 * Soft residual 1225: app-react GoalEditor trim + Date.parse + isNaN→null differ (no force-merge).
 */
const parseDateInput = (dateStr: string): number | null => {
  if (!dateStr) return null;
  const ymd = getProductTime().input.parseDateValue(dateStr);
  if (ymd == null) return null;
  return getProductTime().codec.startOfYmd(ymd);
};

function getTimeConfigErrorMessage(error: unknown) {
  return translateResultError(error, t, {
    fallbackKey: 'task.timeConfig.updateFailed',
  });
}

/**
 * Combine hour + minute into minute-of-day (0-1439)
 */
function combineTimeParts(hour: string, minute: string): number {
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isInteger(h) || h < 0 || h > 23) return 0;
  if (!Number.isInteger(m) || m < 0 || m > 59) return 0;
  return h * 60 + m;
}

/**
 * Split minute-of-day into hour / minute parts
 */
/** Residual 1312: minute-of-day split pad dual retired onto padTwoDigits sole. */
function splitMinutes(minutes: number): { hour: string; minute: string } {
  const normalized = Number.isFinite(minutes) ? Math.max(0, Math.min(1439, minutes)) : 0;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return {
    hour: padTwoDigits(h),
    minute: padTwoDigits(m),
  };
}

// ── Initialization ─────────────────────────────────────────────────────

const initializeFormData = () => {
  const config = props.modelValue.timeConfig as TaskTimeConfigDTO | undefined;

  if (!config) {
    timeType.value = TaskTimeType.AllDay;
    startDate.value = '';
    timePointHour.value = '00';
    timePointMinute.value = '00';
    timeRangeStartHour.value = '00';
    timeRangeStartMinute.value = '00';
    timeRangeEndHour.value = '00';
    timeRangeEndMinute.value = '00';
    return;
  }

  timeType.value = config.timeType;

  if (config.startDate) {
    startDate.value = formatDateToInput(config.startDate);
  }

  if (config.timeType === TaskTimeType.TimePoint && config.timePoint != null) {
    const parts = splitMinutes(config.timePoint);
    timePointHour.value = parts.hour;
    timePointMinute.value = parts.minute;
  }

  if (config.timeType === TaskTimeType.TimeRange && config.timeRange) {
    const startParts = splitMinutes(config.timeRange.start);
    timeRangeStartHour.value = startParts.hour;
    timeRangeStartMinute.value = startParts.minute;

    const endParts = splitMinutes(config.timeRange.end);
    timeRangeEndHour.value = endParts.hour;
    timeRangeEndMinute.value = endParts.minute;
  }
};

// ── Change handlers ────────────────────────────────────────────────────

const handleDateChange = () => {
  try {
    validationErrorState.value = null;
    const parsedDate = parseDateInput(startDate.value);

    const updated: TaskPlanViewModel = {
      ...props.modelValue,
      timeConfig: {
        ...(props.modelValue.timeConfig || {}),
        startDate: parsedDate ?? undefined,
      },
    };
    emit('update:modelValue', updated);
    emit('update:validation', true);
  } catch (error) {
    console.error('更新日期失败:', error);
    validationErrorState.value = { kind: 'result', cause: error };
    emit('update:validation', false);
  }
};

/**
 * Rebuild timePoint timestamp from date + hour + minute and emit
 */
const rebuildTimePoint = () => {
  try {
    validationErrorState.value = null;
    const parsedTime = combineTimeParts(timePointHour.value, timePointMinute.value);
    const parsedStartDate = parseDateInput(startDate.value);

    const updated: TaskPlanViewModel = {
      ...props.modelValue,
      timeConfig: {
        ...(props.modelValue.timeConfig || {}),
        timeType: TaskTimeType.TimePoint,
        startDate: parsedStartDate ?? undefined,
        timePoint: parsedTime,
      },
    };
    emit('update:modelValue', updated);
    emit('update:validation', true);
  } catch (error) {
    console.error('更新时间点失败:', error);
    validationErrorState.value = { kind: 'result', cause: error };
    emit('update:validation', false);
  }
};

/**
 * Rebuild timeRange timestamps from date + hour + minute parts and emit
 */
const rebuildTimeRange = () => {
  try {
    validationErrorState.value = null;
    const parsedStart = combineTimeParts(timeRangeStartHour.value, timeRangeStartMinute.value);
    const parsedEnd = combineTimeParts(timeRangeEndHour.value, timeRangeEndMinute.value);
    const parsedStartDate = parseDateInput(startDate.value);

    if (parsedEnd <= parsedStart) {
      validationErrorState.value = {
        kind: 'translation',
        key: 'task.timeConfig.endBeforeStart',
      };
      emit('update:validation', false);
      return;
    }

    const updated: TaskPlanViewModel = {
      ...props.modelValue,
      timeConfig: {
        ...(props.modelValue.timeConfig || {}),
        timeType: TaskTimeType.TimeRange,
        startDate: parsedStartDate ?? undefined,
        timeRange: {
          start: parsedStart,
          end: parsedEnd,
        },
      },
    };
    emit('update:modelValue', updated);
    emit('update:validation', true);
  } catch (error) {
    console.error('更新时间段失败:', error);
    validationErrorState.value = { kind: 'result', cause: error };
    emit('update:validation', false);
  }
};

/**
 * 处理时间类型变更
 */
const handleTimeTypeChange = () => {
  try {
    validationErrorState.value = null;

    if (timeType.value === TaskTimeType.TimePoint) {
      timePointHour.value = '00';
      timePointMinute.value = '00';
    }
    if (timeType.value === TaskTimeType.TimeRange) {
      timeRangeStartHour.value = '00';
      timeRangeStartMinute.value = '00';
      timeRangeEndHour.value = '00';
      timeRangeEndMinute.value = '00';
    }

    const updated: TaskPlanViewModel = {
      ...props.modelValue,
      timeConfig: {
        ...(props.modelValue.timeConfig || {}),
        timeType: timeType.value,
      },
    };
    emit('update:modelValue', updated);

    if (timeType.value === TaskTimeType.TimePoint) {
      rebuildTimePoint();
      return;
    }
    if (timeType.value === TaskTimeType.TimeRange) {
      rebuildTimeRange();
      return;
    }

    // 验证通过
    emit('update:validation', true);
  } catch (error) {
    console.error('更新时间类型失败:', error);
    validationErrorState.value = { kind: 'result', cause: error };
    emit('update:validation', false);
  }
};

// 初始化
onMounted(() => {
  initializeFormData();
});

// 监听模板变化
watch(
  () => props.modelValue,
  () => {
    initializeFormData();
  },
  { deep: true },
);
</script>
