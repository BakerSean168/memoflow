<template>
  <section class="space-y-4">
    <div>
      <!-- 启用开关 -->
      <div
        class="mb-4 flex items-center justify-between gap-3 rounded-lg bg-[hsl(var(--surface-raised)/0.34)] px-2.5 py-2 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.42)]"
      >
        <div class="flex min-w-0 items-center gap-2">
          <Target class="h-4 w-4 shrink-0 text-muted-foreground" />
          <Label for="task-key-result-link-enabled" class="cursor-pointer">
            {{ t('task.krLinks.enable') }}
          </Label>
        </div>
        <Switch
          id="task-key-result-link-enabled"
          data-testid="task-goal-binding-toggle"
          :model-value="linkEnabled"
          @update:model-value="handleLinkToggle"
        />
      </div>

      <!-- 关联配置表单 -->
      <div v-if="linkEnabled">
        <!-- 目标选择 -->
        <div class="mb-3">
          <Label for="task-goal-select" class="mb-2 block">{{
            t('task.krLinks.selectGoal')
          }}</Label>
          <Select
            :model-value="selectedGoalId ?? undefined"
            :disabled="props.loadingGoals"
            @update:model-value="handleGoalChange"
          >
            <SelectTrigger
              id="task-goal-select"
              data-testid="task-goal-select-trigger"
              :aria-label="t('task.krLinks.selectGoal')"
            >
              <div class="flex items-center gap-2">
                <Flag class="h-4 w-4" />
                <SelectValue :placeholder="t('task.krLinks.selectGoalPlaceholder')" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="item in goalItems" :key="item.value" :value="item.value">
                <div class="flex items-center gap-2">
                  <Flag :class="['h-4 w-4', getGoalStatusColorClass((item.raw as any).status)]" />
                  <div>
                    <div>{{ item.title }}</div>
                    <div class="text-xs text-muted-foreground">
                      {{ (item.raw as any).description }}
                    </div>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- 关键结果选择 -->
        <div class="mb-3">
          <Label for="task-key-result-select" class="mb-2 block">{{
            t('task.krLinks.selectKR')
          }}</Label>
          <Select
            :model-value="selectedKeyResultId ?? undefined"
            :disabled="!selectedGoalId || selectedKeyResultsLoading"
            @update:model-value="handleKeyResultChange"
          >
            <SelectTrigger
              id="task-key-result-select"
              data-testid="task-key-result-select-trigger"
              :aria-label="t('task.krLinks.selectKR')"
            >
              <div class="flex items-center gap-2">
                <Target class="h-4 w-4" />
                <SelectValue :placeholder="t('task.krLinks.selectGoalFirst')" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="item in keyResultItems" :key="item.value" :value="item.value">
                <div class="flex items-center gap-2">
                  <div
                    :class="[
                      'flex items-center justify-center h-8 w-8 rounded-full text-xs text-white shrink-0',
                      getProgressBgClass((item.raw as any).progressPercentage),
                    ]"
                  >
                    {{ (item.raw as any).progressPercentage }}%
                  </div>
                  <div>
                    <div>{{ item.title }}</div>
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-muted-foreground">{{
                        (item.raw as any).progressText
                      }}</span>
                      <Badge variant="secondary" class="text-xs">
                        {{ t('task.krLinks.weight', { value: (item.raw as any).weight }) }}
                      </Badge>
                    </div>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <div
            v-if="selectedKeyResultsLoading"
            class="mt-2 flex items-center gap-2 text-xs text-muted-foreground"
            role="status"
          >
            <LoaderCircle class="h-3.5 w-3.5 animate-spin" />
            {{ t('task.krLinks.loadingKeyResults') }}
          </div>
          <div
            v-else-if="selectedKeyResultError"
            class="mt-2 flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            <span>{{ selectedKeyResultError }}</span>
            <Button type="button" variant="ghost" size="sm" class="h-7" @click="retryKeyResults">
              <RotateCw class="mr-1 h-3.5 w-3.5" />
              {{ t('task.krLinks.retry') }}
            </Button>
          </div>
          <p
            v-else-if="selectedGoalKeyResultsLoaded && keyResults.length === 0"
            class="mt-2 text-xs text-muted-foreground"
          >
            {{ t('task.krLinks.emptyKeyResults') }}
          </p>
        </div>

        <div v-if="selectedKeyResultId" class="mb-3">
          <Label for="task-goal-mode" class="mb-2 block">{{ t('task.krLinks.updateMode') }}</Label>
          <p v-if="selectedKeyResult" class="mb-2 text-xs text-muted-foreground">
            {{ selectedKeyResult.title }} · {{ selectedKeyResult.methodLabel }} ·
            {{ selectedKeyResult.currentValue }} / {{ selectedKeyResult.targetValue }}
            {{ selectedKeyResult.unit }}
          </p>
          <Select :model-value="mode" @update:model-value="handleModeChange">
            <SelectTrigger id="task-goal-mode" data-testid="task-goal-mode"
              ><SelectValue
            /></SelectTrigger>
            <SelectContent>
              <SelectItem value="LinkOnly" data-testid="task-goal-mode-LinkOnly">{{
                t('task.krLinks.mode.LinkOnly')
              }}</SelectItem>
              <SelectItem
                value="FixedAutomatic"
                :disabled="!fixedAllowed"
                data-testid="task-goal-mode-FixedAutomatic"
                >{{ t('task.krLinks.mode.FixedAutomatic') }}</SelectItem
              >
              <SelectItem
                value="PromptedMeasurement"
                data-testid="task-goal-mode-PromptedMeasurement"
                >{{ t('task.krLinks.mode.PromptedMeasurement') }}</SelectItem
              >
            </SelectContent>
          </Select>
          <p v-if="!fixedAllowed" class="mt-1 text-xs text-muted-foreground">
            {{ t('task.krLinks.fixedSumOnly') }}
          </p>
        </div>
        <div v-if="mode === 'PromptedMeasurement' && selectedKeyResultId" class="mb-3">
          <Label for="task-goal-suggestion" class="mb-2 block"
            >{{ t('task.krLinks.suggestedValue') }} · {{ recordPromptLabel }}</Label
          >
          <div class="flex items-center gap-2">
            <Input
              id="task-goal-suggestion"
              data-testid="task-goal-suggestion-input"
              type="number"
              step="any"
              :model-value="suggestedValue ?? ''"
              @update:model-value="handleSuggestionChange"
            />
            <span class="text-sm text-muted-foreground">{{ selectedKeyResult?.unit }}</span>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">{{ t('task.krLinks.suggestionHint') }}</p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ t('task.krLinks.trigger.perInstance') }}
          </p>
        </div>

        <!-- 增量值设置 -->
        <div v-if="mode === 'FixedAutomatic'" class="mb-3">
          <Label for="task-goal-increment" class="mb-2 block">{{
            t('task.krLinks.progressValue')
          }}</Label>
          <div class="flex items-center gap-2">
            <PlusCircle class="h-4 w-4 text-muted-foreground" />
            <Input
              :model-value="incrementValue"
              id="task-goal-increment"
              data-testid="task-goal-increment-input"
              type="number"
              step="any"
              :placeholder="t('task.krLinks.progressPlaceholder')"
              @update:model-value="handleFixedValueChange"
            />
            <span class="text-sm text-muted-foreground">{{ selectedKeyResult?.unit }}</span>
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            {{ t('task.krLinks.progressText') }}
          </p>
        </div>

        <div v-if="mode === 'FixedAutomatic'" class="mb-3">
          <Label for="task-goal-trigger" class="mb-2 block">{{
            t('task.krLinks.trigger.label')
          }}</Label>
          <Select
            :model-value="progressTrigger ?? undefined"
            :disabled="!selectedGoalId || !selectedKeyResultId"
            @update:model-value="handleTriggerChange"
          >
            <SelectTrigger id="task-goal-trigger" :aria-label="t('task.krLinks.trigger.label')">
              <div class="flex items-center gap-2">
                <Link2 class="h-4 w-4" />
                <SelectValue :placeholder="t('task.krLinks.trigger.placeholder')" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="item in triggerItems"
                :key="item.value"
                :value="item.value"
                :disabled="item.disabled"
                :data-testid="`kr-progress-trigger-${item.value}`"
              >
                <div>
                  <div>{{ item.title }}</div>
                  <div class="text-xs text-muted-foreground">{{ item.description }}</div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- 预览卡片 -->
        <Card
          v-if="hasCompleteBinding && mode === 'FixedAutomatic'"
          class="mt-4 bg-success/10 dark:bg-success/20 border-success/40 dark:border-success/50"
        >
          <CardContent class="pt-4">
            <div class="flex items-center">
              <Link2 class="h-10 w-10 text-success mr-3 shrink-0" />
              <div class="flex-1">
                <div class="text-sm font-medium mb-1">{{ t('task.krLinks.configPreview') }}</div>
                <div class="text-xs text-muted-foreground">
                  {{
                    t(`task.krLinks.previewText.${progressTrigger}`, {
                      value: incrementValue,
                      unit: selectedKeyResult?.unit ?? '',
                    })
                  }}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { TaskGoalProgressConfigurationSchema } from '@memoflow/contracts/task';

import { ref, computed, watch, onMounted } from 'vue';
import { TaskGoalBindingTrigger, type TaskGoalBindingTriggerValue } from '@memoflow/contracts/task';
import type { TaskPlanViewModel, GoalBindingOption, KeyResultBindingOption } from '../../types';
import {
  Card,
  CardContent,
  Switch,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Input,
  Badge,
  Button,
} from '@memoflow/ui-vue-shadcn';
import { Target, Flag, PlusCircle, Link2, LoaderCircle, RotateCw } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { getKeyResultRecordPromptLabel } from '../../../../goal';
import { normalizeSelectString } from '../../../../../shared/utils/normalize-select-string';

const { t } = useI18n();

const props = defineProps<{
  modelValue: TaskPlanViewModel;
  goals?: GoalBindingOption[];
  keyResultsByGoal?: Record<string, KeyResultBindingOption[]>;
  loadingGoals?: boolean;
  loadingKeyResults?: Record<string, boolean>;
  keyResultErrorsByGoal?: Record<string, string | null>;
  onRequestKeyResults?: (
    goalId: string,
    force?: boolean,
  ) => Promise<KeyResultBindingOption[] | void> | void;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: TaskPlanViewModel];
  'update:validation': [isValid: boolean];
}>();

// ===== 响应式数据 =====
const linkEnabled = ref(false);
const selectedGoalId = ref<string | null>(null);
const selectedKeyResultId = ref<string | null>(null);
type BindingMode = 'LinkOnly' | 'FixedAutomatic' | 'PromptedMeasurement';
const mode = ref<BindingMode>('LinkOnly');
const suggestedValue = ref<number | null>(null);
const numericInputValid = ref(true);
const incrementValue = ref<number>(1);
const progressTrigger = ref<TaskGoalBindingTriggerValue>(TaskGoalBindingTrigger.EachCompletion);
// ===== 计算属性 =====
const hasCompleteBinding = computed(() => {
  return (
    linkEnabled.value &&
    selectedGoalId.value &&
    selectedKeyResultId.value &&
    mode.value === 'FixedAutomatic' &&
    Number.isFinite(incrementValue.value) &&
    incrementValue.value !== 0 &&
    !!progressTrigger.value
  );
});

const goalItems = computed(() => {
  return (props.goals || []).map((g) => ({
    value: g.id,
    title: g.title,
    raw: g,
  }));
});

const keyResults = computed(() => {
  if (!selectedGoalId.value) return [];
  return props.keyResultsByGoal?.[selectedGoalId.value] ?? [];
});

const selectedKeyResult = computed(() =>
  keyResults.value.find((kr) => kr.id === selectedKeyResultId.value),
);
const fixedAllowed = computed(() => selectedKeyResult.value?.calculationMethod === 'Sum');
const recordPromptLabel = computed(() =>
  selectedKeyResult.value
    ? getKeyResultRecordPromptLabel(selectedKeyResult.value.calculationMethod, t)
    : '',
);

const selectedGoalKeyResultsLoaded = computed(() => {
  if (!selectedGoalId.value) return false;
  return Object.prototype.hasOwnProperty.call(props.keyResultsByGoal ?? {}, selectedGoalId.value);
});

const selectedKeyResultsLoading = computed(() =>
  selectedGoalId.value ? Boolean(props.loadingKeyResults?.[selectedGoalId.value]) : false,
);

const selectedKeyResultError = computed(() =>
  selectedGoalId.value ? (props.keyResultErrorsByGoal?.[selectedGoalId.value] ?? null) : null,
);

const keyResultItems = computed(() => {
  return keyResults.value.map((kr) => ({
    value: kr.id,
    title: kr.title,
    raw: {
      ...kr,
      progressPercentage: kr.progress.percentage,
      progressText: `${kr.progress.current} / ${kr.progress.target}`,
    },
  }));
});

const wholePlanTriggerAllowed = computed(() => {
  const schedule = props.modelValue.schedule;
  return schedule.kind === 'OneTime' || schedule.recurrence.end.kind !== 'Never';
});

const triggerItems = computed(() => [
  {
    value: TaskGoalBindingTrigger.EachCompletion,
    title: t('task.krLinks.trigger.perInstance'),
    description: t('task.krLinks.trigger.perInstanceDesc'),
    disabled: false,
  },
  {
    value: TaskGoalBindingTrigger.PlanCompletion,
    title: t('task.krLinks.trigger.allInstancesCompleted'),
    description: wholePlanTriggerAllowed.value
      ? t('task.krLinks.trigger.allInstancesCompletedDesc')
      : t('task.krLinks.trigger.finitePlanOnly'),
    disabled: !wholePlanTriggerAllowed.value,
  },
]);

// ===== UI 辅助方法 =====
const getGoalStatusColorClass = (status: string): string => {
  const colorMap: Record<string, string> = {
    NOT_STARTED: 'text-muted-foreground',
    IN_PROGRESS: 'text-primary',
    COMPLETED: 'text-success',
    ARCHIVED: 'text-warning',
    ABANDONED: 'text-destructive',
  };
  return colorMap[status] || 'text-muted-foreground';
};

const getProgressBgClass = (percentage: number): string => {
  if (percentage >= 80) return 'bg-success';
  if (percentage >= 50) return 'bg-primary';
  if (percentage >= 30) return 'bg-warning';
  return 'bg-destructive';
};

// ===== 事件处理 =====
const loadKeyResults = async (goalId: string, force = false) => {
  if (!force && Object.prototype.hasOwnProperty.call(props.keyResultsByGoal ?? {}, goalId)) {
    return;
  }

  try {
    await props.onRequestKeyResults?.(goalId, force);
  } catch (error) {
    console.error('Failed to load key results:', error);
  }
};

const handleLinkToggle = (enabled: boolean | null) => {
  linkEnabled.value = Boolean(enabled);
  if (!enabled) {
    selectedGoalId.value = null;
    selectedKeyResultId.value = null;
    mode.value = 'LinkOnly';
    suggestedValue.value = null;
    numericInputValid.value = true;
    incrementValue.value = 1;
    progressTrigger.value = TaskGoalBindingTrigger.EachCompletion;
  }

  if (!enabled || selectedGoalId.value) {
    updateBinding();
  }
  validateAndEmit();
};

const handleGoalChange = async (value: unknown) => {
  const goalId = normalizeSelectString(value);
  selectedGoalId.value = goalId ?? null;
  selectedKeyResultId.value = null;
  mode.value = 'LinkOnly';
  numericInputValid.value = true;
  suggestedValue.value = null;
  updateBinding();
  validateAndEmit();

  if (goalId) {
    await loadKeyResults(goalId);
  }
};

const handleKeyResultChange = (value: unknown) => {
  selectedKeyResultId.value = normalizeSelectString(value);
  reconcileMode();
  updateBinding();
  validateAndEmit();
};

// Deterministic safety transition: an explicitly known non-Sum KR moves Fixed to Prompt.
const reconcileMode = () => {
  if (!selectedKeyResultId.value) {
    mode.value = 'LinkOnly';
    numericInputValid.value = true;
  } else if (mode.value === 'FixedAutomatic' && selectedKeyResult.value && !fixedAllowed.value) {
    mode.value = 'PromptedMeasurement';
    suggestedValue.value = null;
    numericInputValid.value = true;
    progressTrigger.value = TaskGoalBindingTrigger.EachCompletion;
  }
};
const handleModeChange = (rawValue: unknown) => {
  const next = normalizeSelectString(rawValue);
  if (next !== 'LinkOnly' && next !== 'FixedAutomatic' && next !== 'PromptedMeasurement') return;
  if (!selectedKeyResultId.value || (next === 'FixedAutomatic' && !fixedAllowed.value)) return;
  mode.value = next;
  numericInputValid.value = true;
  if (next === 'PromptedMeasurement') progressTrigger.value = TaskGoalBindingTrigger.EachCompletion;
  updateBinding();
  validateAndEmit();
};
const handleFixedValueChange = (rawValue: string | number) => {
  const value = Number(rawValue);
  numericInputValid.value = String(rawValue).trim() !== '' && Number.isFinite(value) && value !== 0;
  if (numericInputValid.value) {
    incrementValue.value = value;
    updateBinding();
  }
  validateAndEmit();
};
const handleSuggestionChange = (rawValue: string | number) => {
  const value = String(rawValue).trim() === '' ? null : Number(rawValue);
  numericInputValid.value = value === null || Number.isFinite(value);
  if (numericInputValid.value) {
    suggestedValue.value = value;
    updateBinding();
  }
  validateAndEmit();
};

const handleTriggerChange = (rawValue: unknown) => {
  const value = normalizeSelectString(rawValue);
  if (value === TaskGoalBindingTrigger.PlanCompletion && !wholePlanTriggerAllowed.value) {
    return;
  }
  progressTrigger.value =
    (value as typeof progressTrigger.value) ?? TaskGoalBindingTrigger.EachCompletion;
  updateBinding();
  validateAndEmit();
};

const updateBinding = () => {
  const hasGoal = linkEnabled.value && Boolean(selectedGoalId.value);

  const updated: TaskPlanViewModel = {
    ...props.modelValue,
    goalBinding: hasGoal
      ? {
          goalId: selectedGoalId.value!,
          keyResultId: selectedKeyResultId.value,
          progressRule:
            selectedKeyResultId.value && mode.value === 'FixedAutomatic'
              ? { mode: 'Fixed', value: incrementValue.value, trigger: progressTrigger.value }
              : selectedKeyResultId.value && mode.value === 'PromptedMeasurement'
                ? {
                    mode: 'Prompt',
                    trigger: 'EachCompletion',
                    suggestedValue: suggestedValue.value,
                  }
                : null,
        }
      : null,
  };
  emit('update:modelValue', updated);
};

const retryKeyResults = () => {
  if (selectedGoalId.value) {
    void loadKeyResults(selectedGoalId.value, true);
  }
};

const validateAndEmit = () => {
  // Goal-level links are valid; both recording modes require a KR.
  const hasValidLink = !!selectedGoalId.value;
  const hasValidContribution =
    !(mode.value === 'FixedAutomatic') ||
    (!!selectedKeyResultId.value &&
      !!progressTrigger.value &&
      (progressTrigger.value !== TaskGoalBindingTrigger.PlanCompletion ||
        wholePlanTriggerAllowed.value) &&
      Number.isFinite(incrementValue.value) &&
      incrementValue.value !== 0 &&
      fixedAllowed.value);
  const isValid =
    !linkEnabled.value ||
    (hasValidLink &&
      hasValidContribution &&
      numericInputValid.value &&
      (mode.value !== 'PromptedMeasurement' || !!selectedKeyResultId.value));

  emit('update:validation', isValid);
};

// ===== 初始化 =====
const initializeFromModel = () => {
  const binding = props.modelValue.goalBinding;
  if (binding) {
    linkEnabled.value = true;
    selectedGoalId.value = binding.goalId ?? null;
    selectedKeyResultId.value = binding.keyResultId ?? null;
    const rule = TaskGoalProgressConfigurationSchema.parse(binding).progressRule;
    mode.value = !selectedKeyResultId.value
      ? 'LinkOnly'
      : rule?.mode === 'Fixed'
        ? 'FixedAutomatic'
        : rule?.mode === 'Prompt'
          ? 'PromptedMeasurement'
          : 'LinkOnly';
    incrementValue.value = rule?.mode === 'Fixed' ? rule.value : 1;
    suggestedValue.value = rule?.mode === 'Prompt' ? (rule.suggestedValue ?? null) : null;
    progressTrigger.value = rule?.trigger ?? TaskGoalBindingTrigger.EachCompletion;
    numericInputValid.value = true;
  } else {
    linkEnabled.value = false;
    selectedGoalId.value = null;
    selectedKeyResultId.value = null;
    mode.value = 'LinkOnly';
    suggestedValue.value = null;
    numericInputValid.value = true;
    incrementValue.value = 1;
    progressTrigger.value = TaskGoalBindingTrigger.EachCompletion;
  }
};

watch(selectedKeyResult, () => {
  const previous = mode.value;
  reconcileMode();
  if (previous !== mode.value) updateBinding();
  validateAndEmit();
});

// ===== 生命周期 =====
onMounted(async () => {
  // 从模型初始化表单
  initializeFromModel();

  if (
    mode.value === 'FixedAutomatic' &&
    progressTrigger.value === TaskGoalBindingTrigger.PlanCompletion &&
    !wholePlanTriggerAllowed.value
  ) {
    progressTrigger.value = TaskGoalBindingTrigger.EachCompletion;
    updateBinding();
  }

  // 如果有已选择的目标，加载其关键结果
  if (selectedGoalId.value) {
    await loadKeyResults(selectedGoalId.value);
  }

  // 初始验证
  validateAndEmit();
});

// ===== 监听器 =====
watch(
  () => props.modelValue.goalBinding,
  () => {
    initializeFromModel();
    const previous = mode.value;
    reconcileMode();
    if (previous !== mode.value) updateBinding();
    validateAndEmit();
  },
  { deep: true },
);

watch(
  () => props.modelValue.schedule,
  () => {
    if (
      mode.value === 'FixedAutomatic' &&
      progressTrigger.value === TaskGoalBindingTrigger.PlanCompletion &&
      !wholePlanTriggerAllowed.value
    ) {
      progressTrigger.value = TaskGoalBindingTrigger.EachCompletion;
      updateBinding();
    }
    validateAndEmit();
  },
  { deep: true },
);
</script>
