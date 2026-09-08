<template>
  <section class="space-y-4" aria-labelledby="task-kr-link-heading">
    <header class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Target class="h-5 w-5" />
        <h3 id="task-kr-link-heading" class="text-sm font-semibold">
          {{ t('task.krLinks.title') }}
        </h3>
      </div>
      <Badge v-if="hasGoalBinding" variant="default" class="bg-success">
        <CheckCircle class="h-3 w-3 mr-1" />
        {{ t('task.krLinks.linkedCount') }}
      </Badge>
    </header>

    <div>
      <!-- 提示信息 -->
      <Alert v-if="!hasGoalBinding" class="mb-4">
        <Info class="h-4 w-4" />
        <AlertDescription class="text-xs">
          {{ t('task.krLinks.hint') }}
        </AlertDescription>
      </Alert>

      <!-- 启用开关 -->
      <div class="flex items-center gap-2 mb-4">
        <Switch
          id="task-key-result-link-enabled"
          data-testid="task-goal-binding-toggle"
          :model-value="linkEnabled"
          @update:model-value="handleLinkToggle"
        />
        <Label for="task-key-result-link-enabled">{{ t('task.krLinks.enable') }}</Label>
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

        <div class="mb-3 rounded-md border p-3">
          <div class="flex items-center gap-2">
            <Switch
              id="task-goal-contribution-enabled"
              data-testid="task-goal-contribution-toggle"
              :model-value="contributionEnabled"
              :disabled="!selectedGoalId || !selectedKeyResultId"
              @update:model-value="handleContributionToggle"
            />
            <Label for="task-goal-contribution-enabled">{{
              t('task.krLinks.contributionEnable')
            }}</Label>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">{{ t('task.krLinks.contributionHint') }}</p>
        </div>

        <!-- 增量值设置 -->
        <div v-if="contributionEnabled" class="mb-3">
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
              :placeholder="t('task.krLinks.progressPlaceholder')"
              @update:model-value="
                (val) => {
                  incrementValue = Number(val);
                  handleIncrementChange();
                }
              "
            />
            <span class="text-sm text-muted-foreground">{{ t('task.krLinks.points') }}</span>
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            {{ t('task.krLinks.progressText') }}
          </p>
        </div>

        <div v-if="contributionEnabled" class="mb-3">
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
          v-if="hasCompleteBinding && contributionEnabled"
          class="mt-4 bg-success/10 dark:bg-success/20 border-success/40 dark:border-success/50"
        >
          <CardContent class="pt-4">
            <div class="flex items-center">
              <Link2 class="h-10 w-10 text-success mr-3 shrink-0" />
              <div class="flex-1">
                <div class="text-sm font-medium mb-1">{{ t('task.krLinks.configPreview') }}</div>
                <div class="text-xs text-muted-foreground">
                  {{ t(`task.krLinks.previewText.${progressTrigger}`, { value: incrementValue }) }}
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
import { ref, computed, watch, onMounted } from 'vue';
import {
  TaskGoalBindingTrigger,
  type RecurrenceRuleDTO,
  type TaskGoalBindingTriggerValue,
} from '@memoflow/contracts/task';
import type { TaskPlanViewModel, GoalBindingOption, KeyResultBindingOption } from '../../types';
import {
  Card,
  CardContent,
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
  Badge,
  Button,
} from '@memoflow/ui-vue-shadcn';
import {
  Target,
  CheckCircle,
  Info,
  Flag,
  PlusCircle,
  Link2,
  LoaderCircle,
  RotateCw,
} from '@lucide/vue';
import { useI18n } from 'vue-i18n';
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
const contributionEnabled = ref(false);
const incrementValue = ref<number>(1);
const progressTrigger = ref<TaskGoalBindingTriggerValue>(TaskGoalBindingTrigger.EachCompletion);
// ===== 计算属性 =====
const hasGoalBinding = computed(() => {
  return Boolean(props.modelValue.goalBinding?.goalId);
});

const hasCompleteBinding = computed(() => {
  return (
    linkEnabled.value &&
    selectedGoalId.value &&
    selectedKeyResultId.value &&
    contributionEnabled.value &&
    incrementValue.value > 0 &&
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
  const recurrenceRule = props.modelValue.recurrenceRule as RecurrenceRuleDTO | null | undefined;
  return !recurrenceRule || recurrenceRule.endDate !== null || recurrenceRule.occurrences !== null;
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
    contributionEnabled.value = false;
    incrementValue.value = 1;
    progressTrigger.value = TaskGoalBindingTrigger.EachCompletion;
  }

  updateBinding();
  validateAndEmit();
};

const handleGoalChange = async (value: unknown) => {
  const goalId = normalizeSelectString(value);
  selectedGoalId.value = goalId ?? null;
  selectedKeyResultId.value = null;
  updateBinding();
  validateAndEmit();

  if (goalId) {
    await loadKeyResults(goalId);
  }
};

const handleKeyResultChange = (value: unknown) => {
  selectedKeyResultId.value = normalizeSelectString(value);
  updateBinding();
  validateAndEmit();
};

const handleContributionToggle = (enabled: boolean | null) => {
  contributionEnabled.value = Boolean(enabled);
  if (contributionEnabled.value && !progressTrigger.value) {
    progressTrigger.value = TaskGoalBindingTrigger.EachCompletion;
  }
  updateBinding();
  validateAndEmit();
};

const handleIncrementChange = () => {
  updateBinding();
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
  const canContribute = contributionEnabled.value && Boolean(selectedKeyResultId.value);
  const updated: TaskPlanViewModel = {
    ...props.modelValue,
    goalBinding: hasGoal
      ? {
          goalId: selectedGoalId.value!,
          keyResultId: selectedKeyResultId.value,
          ...(canContribute
            ? { contribution: { value: incrementValue.value, trigger: progressTrigger.value } }
            : {}),
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
  // Goal-level link is valid on its own; only automatic contribution requires a KR.
  const hasValidLink = !!selectedGoalId.value;
  const hasValidContribution =
    !contributionEnabled.value ||
    (!!selectedKeyResultId.value &&
      !!progressTrigger.value &&
      (progressTrigger.value !== TaskGoalBindingTrigger.PlanCompletion ||
        wholePlanTriggerAllowed.value) &&
      incrementValue.value > 0 &&
      incrementValue.value <= 1000);
  const isValid = !linkEnabled.value || (hasValidLink && hasValidContribution);

  emit('update:validation', isValid);
};

// ===== 初始化 =====
const initializeFromModel = () => {
  const binding = props.modelValue.goalBinding;
  if (binding) {
    linkEnabled.value = true;
    selectedGoalId.value = binding.goalId ?? null;
    selectedKeyResultId.value = binding.keyResultId ?? null;
    contributionEnabled.value = !!binding.contribution;
    incrementValue.value = binding.contribution?.value ?? 1;
    progressTrigger.value = binding.contribution?.trigger ?? TaskGoalBindingTrigger.EachCompletion;
  } else {
    linkEnabled.value = false;
    selectedGoalId.value = null;
    selectedKeyResultId.value = null;
    contributionEnabled.value = false;
    incrementValue.value = 1;
    progressTrigger.value = TaskGoalBindingTrigger.EachCompletion;
  }
};

// ===== 生命周期 =====
onMounted(async () => {
  // 从模型初始化表单
  initializeFromModel();

  if (
    contributionEnabled.value &&
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
  },
  { deep: true },
);

watch(
  () => [props.modelValue.recurrenceRule, props.modelValue.taskType] as const,
  () => {
    if (
      contributionEnabled.value &&
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
