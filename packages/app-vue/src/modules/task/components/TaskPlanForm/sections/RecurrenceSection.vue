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
  TaskType,
} from '@memoflow/contracts/task';
import type { RecurrenceRuleDTO } from '@memoflow/contracts/task';
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

// TIME-1206: recurrence date display consumes canonical Ymd and never routes through Date -> Ymd compatibility helpers.
// Residual 1267: handleEndDateCalendarSelect dual retired onto handleCalendarSelect sole (setter → endDate ref).

/** Convert endDate string to Date for Calendar :selected */
/** Soft residual 1255: endDateAsDate inline YYYY-MM-DD→Date (parseToDate sole available; keep co-located). */
const endDateAsDate = computed(() => {
  if (!endDate.value) return undefined;
  return new Date(endDate.value + 'T00:00:00');
});

/** Handle Calendar selection for end date — Residual 1267 dual retired onto handleCalendarSelect sole. */
function handleEndDateCalendarSelect(date: unknown) {
  handleCalendarSelect(date, (value) => {
    endDate.value = value;
  });
}

/**
 * 获取默认结束日期（今天 + 配置的天数）
 */
const getDefaultEndDate = (): string => {
  const today = getProductTime().calendar.toYmd(Date.now());
  return String(addYmdDays(today, RECURRENCE_RULE_DEFAULTS.DEFAULT_END_DATE_DAYS));
};

const props = defineProps<{
  modelValue: TaskPlanViewModel;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: TaskPlanViewModel];
  'update:validation': [isValid: boolean];
}>();

const updateTemplate = (updater: (template: TaskPlanViewModel) => void) => {
  const currentRule = props.modelValue.recurrenceRule as unknown as RecurrenceRuleDTO | null;
  const updatedTemplate: TaskPlanViewModel = {
    ...props.modelValue,
    timeConfig: { ...(props.modelValue.timeConfig || {}) },
    recurrenceRule: currentRule ? { ...currentRule } : null,
  } as TaskPlanViewModel;
  updater(updatedTemplate);
  emit('update:modelValue', updatedTemplate);
};

// 重复频率选项
const frequencyOptions = computed(() => [
  { title: t('task.recurrence.daily'), value: RecurrenceFrequency.Daily },
  { title: t('task.recurrence.weekly'), value: RecurrenceFrequency.Weekly },
  { title: t('task.recurrence.monthly'), value: RecurrenceFrequency.Monthly },
  { title: t('task.recurrence.yearly'), value: RecurrenceFrequency.Yearly },
]);

// 星期选项
const dayOptions = computed(() => [
  { title: t('task.recurrence.sun'), value: DayOfWeek.Sunday },
  { title: t('task.recurrence.mon'), value: DayOfWeek.Monday },
  { title: t('task.recurrence.tue'), value: DayOfWeek.Tuesday },
  { title: t('task.recurrence.wed'), value: DayOfWeek.Wednesday },
  { title: t('task.recurrence.thu'), value: DayOfWeek.Thursday },
  { title: t('task.recurrence.fri'), value: DayOfWeek.Friday },
  { title: t('task.recurrence.sat'), value: DayOfWeek.Saturday },
]);

// Toggle day for weekly selection (replaces v-chip-group)
const toggleDay = (day: DayOfWeek) => {
  const current = selectedDays.value;
  if (current.includes(day)) {
    selectedDays.value = current.filter((d) => d !== day);
  } else {
    selectedDays.value = [...current, day];
  }
};

// 重复启用状态
const recurrenceEnabled = computed({
  get: () => !!props.modelValue.recurrenceRule,
  set: (value: boolean) => {
    if (value && !props.modelValue.recurrenceRule) {
      // 启用重复：创建默认规则
      const defaultRule: RecurrenceRuleDTO = {
        frequency: RecurrenceFrequency.Daily,
        interval: 1,
        daysOfWeek: [],
        endDate: null,
        occurrences: null,
      };
      updateTemplate((template) => {
        template.recurrenceRule = defaultRule as unknown as Record<string, unknown>;
        template.taskType = TaskType.Recurring;
      });
    } else if (!value) {
      // 禁用重复：清空规则
      updateTemplate((template) => {
        template.recurrenceRule = null;
        template.taskType = TaskType.OneTime;
      });
    }
  },
});

// 频率
const frequency = computed({
  get: () =>
    (props.modelValue.recurrenceRule as unknown as RecurrenceRuleDTO | null)?.frequency ??
    RecurrenceFrequency.Daily,
  set: (value: RecurrenceFrequency) => {
    updateRecurrenceRule({ frequency: value });
  },
});

// 间隔
const interval = computed({
  get: () =>
    (props.modelValue.recurrenceRule as unknown as RecurrenceRuleDTO | null)?.interval ?? 1,
  set: (value: number) => {
    updateRecurrenceRule({ interval: value });
  },
});

// 选中的星期
const selectedDays = computed({
  get: () =>
    (props.modelValue.recurrenceRule as unknown as RecurrenceRuleDTO | null)?.daysOfWeek ?? [],
  set: (value: DayOfWeek[]) => {
    updateRecurrenceRule({ daysOfWeek: value });
  },
});

// 结束条件类型
const endConditionType = ref<'never' | 'date' | 'count'>('never');

// 结束日期
const endDate = ref<string>('');

// 重复次数
const occurrences = ref<number>(1);

// 初始化结束条件
const initializeEndCondition = () => {
  const rule = props.modelValue.recurrenceRule as unknown as RecurrenceRuleDTO | null;
  if (!rule) {
    endConditionType.value = 'never';
    return;
  }

  if (rule.endDate) {
    endConditionType.value = 'date';
    endDate.value = new Date(rule.endDate).toISOString().split('T')[0];
  } else if (rule.occurrences) {
    endConditionType.value = 'count';
    occurrences.value = rule.occurrences;
  } else {
    endConditionType.value = 'never';
  }
};

// 更新重复规则
const updateRecurrenceRule = (updates: Partial<RecurrenceRuleDTO>) => {
  const currentRule = props.modelValue.recurrenceRule as unknown as RecurrenceRuleDTO | null;
  if (!currentRule) return;

  const newRuleDTO: RecurrenceRuleDTO = {
    frequency: updates.frequency ?? currentRule.frequency,
    interval: updates.interval ?? currentRule.interval,
    daysOfWeek: updates.daysOfWeek ?? currentRule.daysOfWeek,
    endDate: updates.endDate !== undefined ? updates.endDate : currentRule.endDate,
    occurrences: updates.occurrences !== undefined ? updates.occurrences : currentRule.occurrences,
  };

  updateTemplate((template) => {
    template.recurrenceRule = newRuleDTO as unknown as Record<string, unknown>;
  });
};

// 监听结束条件类型变化
watch(endConditionType, (newValue) => {
  switch (newValue) {
    case 'never':
      updateRecurrenceRule({ endDate: null, occurrences: null });
      break;
    case 'date':
      // 如果没有设置结束日期，使用默认值（今天 + 30 天）
      if (!endDate.value) {
        endDate.value = getDefaultEndDate();
      }
      updateRecurrenceRule({
        endDate: new Date(endDate.value).getTime(),
        occurrences: null,
      });
      break;
    case 'count':
      // 如果没有设置次数，使用默认值
      if (!occurrences.value || occurrences.value < 1) {
        occurrences.value = RECURRENCE_RULE_DEFAULTS.DEFAULT_OCCURRENCES;
      }
      updateRecurrenceRule({
        endDate: null,
        occurrences: occurrences.value,
      });
      break;
  }
});

// 监听结束日期变化
watch(endDate, (newValue) => {
  if (endConditionType.value === 'date' && newValue) {
    updateRecurrenceRule({
      endDate: new Date(newValue).getTime(),
      occurrences: null,
    });
  }
});

// 监听重复次数变化
watch(occurrences, (newValue) => {
  if (endConditionType.value === 'count' && newValue > 0) {
    updateRecurrenceRule({
      endDate: null,
      occurrences: newValue,
    });
  }
});

// UI 辅助
const intervalHint = computed(() => {
  const freq = frequency.value;
  switch (freq) {
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
  const rule = props.modelValue.recurrenceRule as unknown as RecurrenceRuleDTO | null;
  if (!rule) return '';
  const freq = rule.frequency;
  const interval = rule.interval;
  const freqText =
    freq === RecurrenceFrequency.Daily
      ? t('task.recurrence.intervalHintDay')
      : freq === RecurrenceFrequency.Weekly
        ? t('task.recurrence.intervalHintWeek')
        : freq === RecurrenceFrequency.Monthly
          ? t('task.recurrence.intervalHintMonth')
          : t('task.recurrence.intervalHintYear');
  return t('task.recurrence.description', { interval, unit: freqText });
});

// 验证
const validationErrors = ref<string[]>([]);

const validateRecurrence = () => {
  validationErrors.value = [];

  if (recurrenceEnabled.value) {
    const rule = props.modelValue.recurrenceRule as unknown as RecurrenceRuleDTO | null;
    if (!rule) {
      validationErrors.value.push(t('task.recurrence.invalidConfig'));
      return;
    }

    if (rule.interval < 1 || rule.interval > 365) {
      validationErrors.value.push(t('task.recurrence.intervalRange'));
    }

    if (rule.frequency === RecurrenceFrequency.Weekly && rule.daysOfWeek.length === 0) {
      validationErrors.value.push(t('task.recurrence.weekdayRequired'));
    }

    if (endConditionType.value === 'date' && !endDate.value) {
      validationErrors.value.push(t('task.recurrence.selectEndDate'));
    }

    if (endConditionType.value === 'count' && (!occurrences.value || occurrences.value < 1)) {
      validationErrors.value.push(t('task.recurrence.countPositive'));
    }
  }
};

const isValid = computed(() => {
  validateRecurrence();
  return validationErrors.value.length === 0;
});

// 监听验证状态变化
watch(
  isValid,
  (newValue) => {
    emit('update:validation', newValue);
  },
  { immediate: true },
);

// 监听模板变化
watch(
  () => props.modelValue.recurrenceRule,
  () => {
    initializeEndCondition();
    validateRecurrence();
  },
  { deep: true, immediate: true },
);
</script>
