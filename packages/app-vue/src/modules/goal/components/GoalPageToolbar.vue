<template>
  <ProductSurfaceHeader family="collection" data-testid="goal-page-toolbar">
    <ProductSingleSelectFilter
      :model-value="activeSystemView"
      :options="systemViewOptions"
      :accessible-label="t('goal.list.systemView')"
      :icon="Target"
      show-current-count
      test-id="goal-system-view-filter"
      menu-class="w-48"
      @update:model-value="emit('select-system-view', $event as GoalSystemView)"
    />

    <LabelFilterPopover
      :model-value="selectedLabelIds"
      :options="labelOptions"
      :disabled="labelsLoading"
      :label="t('goal.list.labels')"
      :search-placeholder="t('goal.list.searchLabels')"
      :empty-text="t('goal.list.noLabels')"
      :clear-label="t('common.clear')"
      :selection-hint="t('goal.list.matchesAllLabels')"
      :aria-label="t('goal.list.labels')"
      compact
      @update:model-value="emit('update-labels', $event)"
    />

    <ResponsivePrimaryAction
      class="ml-auto"
      :label="t('goal.list.newGoal')"
      :icon="Plus"
      data-testid="create-goal-entry"
      data-primary-action="create-goal"
      @click="emit('create-goal')"
    />
  </ProductSurfaceHeader>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, Target } from '@lucide/vue';
import type { GoalSystemView } from '@memoflow/contracts/goal';
import {
  LabelFilterPopover,
  ProductSingleSelectFilter,
  ProductSurfaceHeader,
  ResponsivePrimaryAction,
  type LabelPickerOption,
} from '../../../shared/components';

const props = defineProps<{
  systemViews: Array<{ id: GoalSystemView; label: string }>;
  activeSystemView: GoalSystemView;
  visibleGoalCount: number;
  labelOptions: readonly LabelPickerOption[];
  selectedLabelIds: readonly string[];
  labelsLoading?: boolean;
}>();

const emit = defineEmits<{
  'create-goal': [];
  'select-system-view': [GoalSystemView];
  'update-labels': [string[]];
}>();

const { t } = useI18n();
const systemViewOptions = computed(() =>
  props.systemViews.map((view) => ({
    value: view.id,
    label: view.label,
    ...(view.id === props.activeSystemView ? { count: props.visibleGoalCount } : {}),
  })),
);
</script>
