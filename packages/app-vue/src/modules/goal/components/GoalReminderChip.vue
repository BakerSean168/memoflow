<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="h-8 max-w-full justify-start gap-1.5 rounded-full px-3 font-normal"
        :disabled="disabled"
        data-testid="goal-reminder-chip"
      >
        <Bell class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ summary }}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-80 max-w-[calc(100vw-2rem)] space-y-4 p-3">
      <div>
        <p class="text-sm font-medium">{{ t('goal.dialog.sectionReminder') }}</p>
        <p class="mt-1 text-xs text-muted-foreground">{{ t('goal.dialog.reminderChipHint') }}</p>
      </div>

      <div class="space-y-3">
        <div class="rounded-md border p-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium">{{ t('goal.dialog.triggerRemainingDays') }}</p>
              <p class="text-xs text-muted-foreground">{{ t('goal.dialog.remainingDaysHint') }}</p>
            </div>
            <Switch
              :model-value="remainingEnabled"
              :aria-label="t('goal.dialog.triggerRemainingDays')"
              :disabled="!target"
              @update:model-value="toggleRemaining"
            />
          </div>
          <div v-if="remainingEnabled" class="mt-3 flex items-center gap-2">
            <Input
              v-model.number="remainingDays"
              type="number"
              min="0"
              class="w-24"
              @update:model-value="commitRemaining"
            />
            <span class="text-xs text-muted-foreground">{{
              t('goal.dialog.daysBeforeTarget')
            }}</span>
          </div>
          <p v-else-if="!target" class="mt-2 text-xs text-muted-foreground">
            {{ t('goal.dialog.reminderRemainingDaysRequiresTargetDate') }}
          </p>
        </div>

        <div class="rounded-md border p-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium">{{ t('goal.dialog.triggerTimeProgress') }}</p>
              <p class="text-xs text-muted-foreground">{{ t('goal.dialog.timeProgressHint') }}</p>
            </div>
            <Switch
              :model-value="progressEnabled"
              :aria-label="t('goal.dialog.triggerTimeProgress')"
              :disabled="!startDate || !target"
              @update:model-value="toggleProgress"
            />
          </div>
          <div v-if="progressEnabled" class="mt-3 flex items-center gap-2">
            <Input
              v-model.number="progressPercent"
              type="number"
              min="1"
              max="100"
              class="w-24"
              @update:model-value="commitProgress"
            />
            <span class="text-xs text-muted-foreground">%</span>
          </div>
          <p v-else-if="!startDate || !target" class="mt-2 text-xs text-muted-foreground">
            {{ t('goal.dialog.reminderTimeProgressRequiresRange') }}
          </p>
        </div>
      </div>

      <Button
        v-if="modelValue"
        type="button"
        variant="ghost"
        size="sm"
        @click="emit('update:modelValue', null)"
      >
        {{ t('common.clear') }}
      </Button>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Bell } from '@lucide/vue';
import {
  ReminderTriggerType,
  type GoalReminderConfigDTO,
  type GoalTimeframe,
} from '@memoflow/contracts/goal';
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
} from '@memoflow/ui-vue-shadcn';

const props = withDefaults(
  defineProps<{
    modelValue: GoalReminderConfigDTO | null;
    startDate: string | null;
    target: GoalTimeframe | null;
    disabled?: boolean;
  }>(),
  { disabled: false },
);
const emit = defineEmits<{ 'update:modelValue': [GoalReminderConfigDTO | null] }>();
const { t } = useI18n();
const remainingDays = ref(7);
const progressPercent = ref(50);

const remainingTrigger = computed(() =>
  props.modelValue?.triggers.find((trigger) => trigger.type === ReminderTriggerType.RemainingDays),
);
const progressTrigger = computed(() =>
  props.modelValue?.triggers.find(
    (trigger) => trigger.type === ReminderTriggerType.TimeProgressPercentage,
  ),
);
const remainingEnabled = computed(() => Boolean(remainingTrigger.value?.enabled));
const progressEnabled = computed(() => Boolean(progressTrigger.value?.enabled));
const enabledCount = computed(
  () => props.modelValue?.triggers.filter((trigger) => trigger.enabled).length ?? 0,
);
const summary = computed(() =>
  enabledCount.value > 0
    ? t('goal.dialog.reminderCount', { count: enabledCount.value })
    : t('goal.dialog.reminder'),
);

watch(
  () => props.modelValue,
  (value) => {
    const remaining = value?.triggers.find(
      (trigger) => trigger.type === ReminderTriggerType.RemainingDays,
    );
    const progress = value?.triggers.find(
      (trigger) => trigger.type === ReminderTriggerType.TimeProgressPercentage,
    );
    if (remaining) remainingDays.value = remaining.value;
    if (progress) progressPercent.value = progress.value;
  },
  { immediate: true, deep: true },
);

function replaceTrigger(type: string, enabled: boolean, value: number): void {
  const existing = props.modelValue?.triggers.filter((trigger) => trigger.type !== type) ?? [];
  const triggers = enabled ? [...existing, { type, value, enabled: true }] : existing;
  emit(
    'update:modelValue',
    triggers.length > 0 ? ({ enabled: true, triggers } as GoalReminderConfigDTO) : null,
  );
}

function toggleRemaining(enabled: boolean): void {
  if (enabled && !props.target) return;
  replaceTrigger(
    ReminderTriggerType.RemainingDays,
    enabled,
    Math.max(0, Number(remainingDays.value) || 0),
  );
}
function toggleProgress(enabled: boolean): void {
  if (enabled && (!props.startDate || !props.target)) return;
  replaceTrigger(
    ReminderTriggerType.TimeProgressPercentage,
    enabled,
    Math.max(1, Math.min(100, Number(progressPercent.value) || 50)),
  );
}
function commitRemaining(): void {
  if (!remainingEnabled.value) return;
  replaceTrigger(
    ReminderTriggerType.RemainingDays,
    true,
    Math.max(0, Number(remainingDays.value) || 0),
  );
}
function commitProgress(): void {
  if (!progressEnabled.value) return;
  replaceTrigger(
    ReminderTriggerType.TimeProgressPercentage,
    true,
    Math.max(1, Math.min(100, Number(progressPercent.value) || 50)),
  );
}
</script>
