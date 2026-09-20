<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <ProductPropertyChip
        class="rounded-md border-transparent bg-muted/40 shadow-none hover:bg-muted/70"
        :disabled="disabled"
        :aria-label="t('goal.dialog.status')"
        data-testid="goal-status-picker"
      >
        <template #icon>
          <component :is="currentOption.icon" class="h-3.5 w-3.5" />
        </template>
        <span>{{ currentOption.label }}</span>
        <ChevronDown class="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </ProductPropertyChip>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-44">
      <DropdownMenuRadioGroup :model-value="modelValue" @update:model-value="updateStatus">
        <DropdownMenuRadioItem
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          class="gap-2"
        >
          <component :is="option.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{{ option.label }}</span>
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronDown, CircleCheck, CircleDashed, CircleDot, CircleOff } from '@lucide/vue';
import { GoalStatus, type GoalStatus as GoalStatusValue } from '@memoflow/contracts/goal';
import { editableGoalStatuses } from '../composables/goalStatusTransitions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@memoflow/ui-vue-shadcn';
import { ProductPropertyChip } from '../../../shared/components';

const props = withDefaults(
  defineProps<{
    modelValue: GoalStatusValue;
    baseStatus: GoalStatusValue;
    disabled?: boolean;
  }>(),
  { disabled: false },
);
const emit = defineEmits<{ 'update:modelValue': [GoalStatusValue] }>();
const { t } = useI18n();

const allOptions = computed(() => [
  { value: GoalStatus.Planned, label: t('goal.list.statusPlanned'), icon: CircleDashed },
  { value: GoalStatus.InProgress, label: t('goal.list.statusInProgress'), icon: CircleDot },
  { value: GoalStatus.Completed, label: t('goal.list.statusCompleted'), icon: CircleCheck },
  { value: GoalStatus.Abandoned, label: t('goal.list.statusAbandoned'), icon: CircleOff },
]);
const options = computed(() => {
  const allowed = new Set(editableGoalStatuses(props.baseStatus));
  return allOptions.value.filter((option) => allowed.has(option.value));
});
const currentOption = computed(
  () => options.value.find((option) => option.value === props.modelValue) ?? options.value[0]!,
);

function updateStatus(value: unknown): void {
  if (typeof value !== 'string') return;
  const next = options.value.find((option) => option.value === value)?.value;
  if (next) emit('update:modelValue', next);
}
</script>
