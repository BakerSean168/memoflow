<template>
  <ProductSurfaceHeader family="collection" data-testid="goal-page-toolbar">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="sm" class="h-8 gap-1.5">
          <Target class="h-4 w-4" />
          <span>{{ currentLabel }}</span>
          <span class="text-xs text-muted-foreground">{{ visibleGoalCount }}</span>
          <ChevronDown class="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-48">
        <DropdownMenuItem
          v-for="view in systemViews"
          :key="view.id"
          :class="activeSystemView === view.id ? 'bg-[hsl(var(--selected))]' : ''"
          @click="emit('select-system-view', view.id)"
        >
          {{ view.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <LabelFilterPopover
      :model-value="selectedLabelIds"
      :options="labelOptions"
      :disabled="labelsLoading"
      :label="t('goal.list.labels')"
      :search-placeholder="t('goal.list.searchLabels')"
      :empty-text="t('goal.list.noLabels')"
      :clear-label="t('common.clear')"
      :selection-hint="t('goal.list.matchesAllLabels')"
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
import { ChevronDown, Plus, Target } from '@lucide/vue';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@memoflow/ui-vue-shadcn';
import type { GoalSystemView } from '@memoflow/contracts/goal';
import {
  LabelFilterPopover,
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
const currentLabel = computed(
  () =>
    props.systemViews.find((view) => view.id === props.activeSystemView)?.label ??
    t('goal.systemFolders.active'),
);
</script>
