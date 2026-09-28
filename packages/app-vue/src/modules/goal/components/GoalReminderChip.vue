<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        v-if="variant === 'header'"
        type="button"
        variant="ghost"
        :size="hasReminder ? 'sm' : 'icon'"
        class="h-8 gap-1.5 text-muted-foreground"
        :disabled="disabled"
        :aria-label="t('goal.reminder.reminder')"
        data-testid="goal-reminder-header"
      >
        <Bell class="h-4 w-4" />
        <span v-if="hasReminder" class="max-w-44 truncate">{{ summary }}</span>
      </Button>
      <ProductPropertyChip
        v-else
        :disabled="disabled"
        data-testid="goal-reminder-chip"
        :active="hasReminder"
      >
        <template #icon><Bell class="h-3.5 w-3.5" /></template>
        {{ summary }}
      </ProductPropertyChip>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="end" class="w-96 max-w-[calc(100vw-2rem)]">
      <DropdownMenuLabel class="flex items-center justify-between gap-3">
        <span>{{
          hasReminder ? t('goal.reminder.rescheduleReminder') : t('goal.reminder.addReminder')
        }}</span>
        <span
          v-if="hasReminder"
          class="max-w-40 truncate text-xs font-normal text-muted-foreground"
        >
          {{ summary }}
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <GoalReminderMenuItems
        :model-value="modelValue"
        :start="start"
        :target="target"
        :disabled="disabled"
        @update:model-value="emit('update:modelValue', $event)"
        @request-custom-time="openCustomReminderPicker"
      />
    </DropdownMenuContent>
  </DropdownMenu>

  <ProductDateTimePicker
    :open="customReminderPickerOpen"
    :model-value="null"
    :title="t('goal.reminder.customDialogTitle')"
    :description="t('goal.reminder.customDialogDescription')"
    :time-label="t('goal.reminder.customClockTime')"
    :hour-label="t('goal.reminder.hour')"
    :minute-label="t('goal.reminder.minute')"
    :cancel-label="t('common.cancel')"
    :apply-label="t('goal.reminder.setReminder')"
    :return-to-today-label="t('goal.dialog.returnToToday')"
    :invalid-time-text="t('goal.reminder.invalidClockTime')"
    :past-time-text="t('goal.reminder.pastTime')"
    :min-value="customReminderMinValue"
    test-id="goal-reminder-chip-custom-picker"
    @update:open="customReminderPickerOpen = $event"
    @apply="addCustomAbsoluteReminder"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Bell } from '@lucide/vue';
import {
  ReminderTriggerType,
  type GoalReminderConfigDTO,
  type GoalTimeframe,
} from '@memoflow/contracts/goal';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@memoflow/ui-vue-shadcn';
import { ProductDateTimePicker, ProductPropertyChip } from '../../../shared/components';
import {
  formatProductDateTime,
  formatProductRelative,
  getProductTime,
} from '../../../shared/utils/product-time';
import GoalReminderMenuItems from './GoalReminderMenuItems.vue';

const props = withDefaults(
  defineProps<{
    modelValue: GoalReminderConfigDTO | null;
    start: GoalTimeframe | null;
    target: GoalTimeframe | null;
    disabled?: boolean;
    variant?: 'property' | 'header';
  }>(),
  { disabled: false, variant: 'property' },
);

const emit = defineEmits<{ 'update:modelValue': [GoalReminderConfigDTO | null] }>();
const { t } = useI18n();
const customReminderPickerOpen = ref(false);
const customReminderMinValue = ref(Number(getProductTime().now()));

const activeTrigger = computed(
  () => props.modelValue?.triggers.find((trigger) => trigger.enabled) ?? null,
);
const hasReminder = computed(() => Boolean(props.modelValue?.enabled && activeTrigger.value));

function openCustomReminderPicker(): void {
  customReminderMinValue.value = Number(getProductTime().now());
  customReminderPickerOpen.value = true;
}

function addCustomAbsoluteReminder(value: number): void {
  const now = Number(getProductTime().now());
  const rounded = Math.floor(value / 60_000) * 60_000;
  if (!Number.isFinite(rounded) || rounded <= now) return;

  const existing = (props.modelValue?.triggers ?? []).filter(
    (trigger) =>
      trigger.enabled && (trigger.type !== ReminderTriggerType.AbsoluteAt || trigger.value > now),
  );
  if (
    existing.some(
      (trigger) => trigger.type === ReminderTriggerType.AbsoluteAt && trigger.value === rounded,
    )
  ) {
    return;
  }
  if (existing.length >= 10) return;

  emit('update:modelValue', {
    enabled: true,
    triggers: [
      ...existing,
      { type: ReminderTriggerType.AbsoluteAt, value: rounded, enabled: true },
    ],
  });
}

const summary = computed(() => {
  const trigger = activeTrigger.value;
  if (!trigger) return t('goal.reminder.reminder');

  if (trigger.type === ReminderTriggerType.AbsoluteAt) {
    return formatProductRelative(trigger.value, formatProductDateTime(trigger.value));
  }

  if (trigger.type === ReminderTriggerType.RemainingDays) {
    if (trigger.value === 0) return t('goal.reminder.onTargetDay');
    return t('goal.reminder.daysBeforeTarget', { count: trigger.value });
  }

  return t('goal.dialog.reminderCount', {
    count: props.modelValue?.triggers.filter((item) => item.enabled).length ?? 1,
  });
});
</script>
