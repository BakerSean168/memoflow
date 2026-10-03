<template>
  <ProductSurfaceHeader family="collection" data-testid="task-page-toolbar">
    <div class="flex min-w-0 flex-1 items-center gap-1.5" data-testid="task-filter-bar">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-8 max-w-40 shrink-0 gap-1.5 px-2"
            data-testid="task-surface-trigger"
          >
            <ListChecks class="h-4 w-4 shrink-0" />
            <span class="truncate">{{ currentSurfaceLabel }}</span>
            <span class="text-xs tabular-nums text-muted-foreground">{{ visibleItemCount }}</span>
            <ChevronDown class="h-3.5 w-3.5 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-44">
          <DropdownMenuItem
            v-for="surface in surfaces"
            :key="surface"
            :data-testid="`task-surface-${surface}`"
            :class="activeSurface === surface ? 'bg-accent' : ''"
            @click="emit('update:activeSurface', surface)"
          >
            {{ t(`task.management.surface.${surface}`) }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div v-if="activeSurface === 'today'" class="hidden shrink-0 @2xl/panel:block">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-8 gap-1.5"
              data-testid="task-status-filter"
            >
              <CircleDot class="h-4 w-4" />
              <span>{{ currentOccurrenceStatusLabel }}</span>
              <ChevronDown class="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-44">
            <DropdownMenuItem
              data-testid="task-status-filter-all"
              :class="occurrenceStatusFilter === 'all' ? 'bg-accent' : ''"
              @click="emit('update:occurrenceStatusFilter', 'all')"
            >
              {{ t('task.management.filter.allStatuses') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-for="status in instanceStatuses"
              :key="status"
              :data-testid="`task-status-filter-${status.toLowerCase()}`"
              :class="occurrenceStatusFilter === status ? 'bg-accent' : ''"
              @click="emit('update:occurrenceStatusFilter', status)"
            >
              {{ occurrenceStatusLabel(status) }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div v-else class="hidden shrink-0 @2xl/panel:block">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-8 gap-1.5"
              data-testid="task-plan-state-filter"
            >
              <CircleDot class="h-4 w-4" />
              <span>{{ currentPlanStateLabel }}</span>
              <ChevronDown class="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-44">
            <DropdownMenuItem
              v-for="state in planStateOptions"
              :key="state"
              :data-testid="`task-plan-state-filter-${state}`"
              :class="planStateFilter === state ? 'bg-accent' : ''"
              @click="emit('update:planStateFilter', state)"
            >
              {{ planStateLabel(state) }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div class="hidden shrink-0 @2xl/panel:block" data-testid="task-label-filter">
        <LabelFilterPopover
          :model-value="labelFilterIds"
          :options="labelOptions"
          :label="t('task.metadata.labels')"
          :search-placeholder="t('task.metadata.searchLabels')"
          :empty-text="t('task.metadata.noLabels')"
          :clear-label="t('common.clear')"
          :selection-hint="t('task.management.filter.matchesAllLabels')"
          :aria-label="t('task.management.filter.label')"
          compact
          @update:model-value="emit('update:labelFilterIds', $event)"
        />
      </div>

      <div v-if="activeSurface === 'today'" class="hidden shrink-0 @2xl/panel:block">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-8 gap-1.5"
              data-testid="task-occurrence-sort"
            >
              <ArrowUpDown class="h-4 w-4" />
              <span class="hidden @2xl/panel:inline">{{ currentSortLabel }}</span>
              <ChevronDown class="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-40">
            <DropdownMenuItem
              v-for="sort in sortOptions"
              :key="sort"
              :data-testid="`task-occurrence-sort-${sort}`"
              :class="occurrenceSort === sort ? 'bg-accent' : ''"
              @click="emit('update:occurrenceSort', sort)"
            >
              {{ t(`task.management.sort.${sort}`) }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div class="shrink-0 @2xl/panel:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-8 gap-1.5 px-2"
              :aria-label="t('task.management.filter.viewOptions')"
              data-testid="task-compact-view-options"
            >
              <ListFilter class="h-4 w-4" />
              <span
                v-if="activeFilterCount > 0"
                class="min-w-4 rounded-full bg-[hsl(var(--selected))] px-1 text-center text-[10px] tabular-nums text-[hsl(var(--foreground-muted))]"
              >
                {{ activeFilterCount }}
              </span>
              <ChevronDown class="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-52">
            <DropdownMenuSub v-if="activeSurface === 'today'">
              <DropdownMenuSubTrigger>
                <CircleDot class="mr-2 h-4 w-4 text-muted-foreground" />
                <span class="min-w-0 flex-1">{{ t('task.management.filter.status') }}</span>
                <span class="ml-3 max-w-24 truncate text-xs text-muted-foreground">
                  {{ currentOccurrenceStatusLabel }}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent class="w-44">
                <DropdownMenuItem
                  :class="occurrenceStatusFilter === 'all' ? 'bg-accent' : ''"
                  @click="emit('update:occurrenceStatusFilter', 'all')"
                >
                  {{ t('task.management.filter.allStatuses') }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-for="status in instanceStatuses"
                  :key="status"
                  :class="occurrenceStatusFilter === status ? 'bg-accent' : ''"
                  @click="emit('update:occurrenceStatusFilter', status)"
                >
                  {{ occurrenceStatusLabel(status) }}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub v-else>
              <DropdownMenuSubTrigger>
                <CircleDot class="mr-2 h-4 w-4 text-muted-foreground" />
                <span class="min-w-0 flex-1">{{ t('task.management.filter.planState') }}</span>
                <span class="ml-3 max-w-24 truncate text-xs text-muted-foreground">
                  {{ currentPlanStateLabel }}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent class="w-44">
                <DropdownMenuItem
                  v-for="state in planStateOptions"
                  :key="state"
                  :class="planStateFilter === state ? 'bg-accent' : ''"
                  @click="emit('update:planStateFilter', state)"
                >
                  {{ planStateLabel(state) }}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Tags class="mr-2 h-4 w-4 text-muted-foreground" />
                <span class="min-w-0 flex-1">{{ t('task.metadata.labels') }}</span>
                <span
                  v-if="labelFilterIds.length"
                  class="ml-3 text-xs tabular-nums text-muted-foreground"
                >
                  {{ labelFilterIds.length }}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent class="w-60">
                <DropdownMenuCheckboxItem
                  v-for="option in labelOptions"
                  :key="option.id"
                  :model-value="labelFilterIds.includes(option.id)"
                  @update:model-value="toggleCompactLabel(option.id)"
                  @select.prevent
                >
                  <span
                    v-if="option.color"
                    class="mr-2 h-2.5 w-2.5 shrink-0 rounded-full border border-border/60"
                    :style="{ backgroundColor: option.color }"
                  />
                  <span class="min-w-0 flex-1 truncate">{{ option.name }}</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuItem v-if="labelOptions.length === 0" disabled>
                  {{ t('task.metadata.noLabels') }}
                </DropdownMenuItem>
                <template v-if="labelFilterIds.length">
                  <DropdownMenuSeparator />
                  <DropdownMenuItem @click="emit('update:labelFilterIds', [])">
                    <X class="mr-2 h-4 w-4 text-muted-foreground" />
                    {{ t('common.clear') }}
                  </DropdownMenuItem>
                </template>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub v-if="activeSurface === 'today'">
              <DropdownMenuSubTrigger>
                <ArrowUpDown class="mr-2 h-4 w-4 text-muted-foreground" />
                <span class="min-w-0 flex-1">{{ t('task.management.filter.sort') }}</span>
                <span class="ml-3 text-xs text-muted-foreground">{{ currentSortLabel }}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent class="w-40">
                <DropdownMenuItem
                  v-for="sort in sortOptions"
                  :key="sort"
                  :class="occurrenceSort === sort ? 'bg-accent' : ''"
                  @click="emit('update:occurrenceSort', sort)"
                >
                  {{ t(`task.management.sort.${sort}`) }}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        v-if="goalScopeLabel"
        class="flex min-w-0 max-w-28 items-center gap-1 rounded-full bg-[hsl(var(--surface-raised)/0.5)] px-2 py-1 text-xs text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.42)] @2xl/panel:max-w-64 @2xl/panel:px-2.5"
        data-testid="task-goal-deeplink-filter"
      >
        <span class="truncate">{{ goalScopeLabel }}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="shrink-0"
          :aria-label="t('common.clear')"
          @click="emit('clearGoalScope')"
        >
          <X class="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>

    <ResponsivePrimaryAction
      class="ml-auto"
      :label="t('task.action.create')"
      :icon="Plus"
      data-testid="create-task-plan-button"
      data-primary-action="create-task"
      @click="emit('createTask')"
    />
  </ProductSurfaceHeader>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ArrowUpDown,
  ChevronDown,
  CircleDot,
  ListChecks,
  ListFilter,
  Plus,
  Tags,
  X,
} from '@lucide/vue';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@memoflow/ui-vue-shadcn';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import {
  LabelFilterPopover,
  ProductSurfaceHeader,
  ResponsivePrimaryAction,
  type LabelPickerOption,
} from '../../../shared/components';
import type { TaskPlanStateFilter, TaskSurface } from './types';
import type { TaskOccurrenceSort } from '../utils/task-occurrence-presentation';

type StatusFilter = 'all' | TaskOccurrenceClientDTO['status'];

const props = defineProps<{
  activeSurface: TaskSurface;
  visibleItemCount: number;
  occurrenceStatusFilter: StatusFilter;
  planStateFilter: TaskPlanStateFilter;
  labelFilterIds: readonly string[];
  labelOptions: readonly LabelPickerOption[];
  occurrenceSort: TaskOccurrenceSort;
  goalScopeLabel?: string | null;
}>();

const emit = defineEmits<{
  'update:activeSurface': [TaskSurface];
  'update:occurrenceStatusFilter': [StatusFilter];
  'update:planStateFilter': [TaskPlanStateFilter];
  'update:labelFilterIds': [string[]];
  'update:occurrenceSort': [TaskOccurrenceSort];
  clearGoalScope: [];
  createTask: [];
}>();

const { t } = useI18n();
const surfaces: TaskSurface[] = ['today', 'plans'];
const instanceStatuses: TaskOccurrenceClientDTO['status'][] = [
  'Pending',
  'InProgress',
  'Completed',
  'Missed',
  'Skipped',
];
const planStateOptions: TaskPlanStateFilter[] = [
  'all',
  'active',
  'paused',
  'succeeded',
  'failed',
  'abandoned',
  'archived',
];
const sortOptions: TaskOccurrenceSort[] = ['time', 'status', 'title'];

const currentSurfaceLabel = computed(() => t(`task.management.surface.${props.activeSurface}`));
const currentOccurrenceStatusLabel = computed(() =>
  props.occurrenceStatusFilter === 'all'
    ? t('task.management.filter.allStatuses')
    : occurrenceStatusLabel(props.occurrenceStatusFilter),
);
const currentPlanStateLabel = computed(() => planStateLabel(props.planStateFilter));
const currentSortLabel = computed(() => t(`task.management.sort.${props.occurrenceSort}`));
const activeFilterCount = computed(
  () =>
    (props.activeSurface === 'today'
      ? props.occurrenceStatusFilter === 'all'
        ? 0
        : 1
      : props.planStateFilter === 'all'
        ? 0
        : 1) + props.labelFilterIds.length,
);

function occurrenceStatusLabel(status: TaskOccurrenceClientDTO['status']): string {
  return t(`task.occurrence.status.${status.toLowerCase()}`);
}

function planStateLabel(state: TaskPlanStateFilter): string {
  return t(`task.management.planState.${state}`);
}

function toggleCompactLabel(labelId: string): void {
  const next = props.labelFilterIds.includes(labelId)
    ? props.labelFilterIds.filter((id) => id !== labelId)
    : [...props.labelFilterIds, labelId];
  emit('update:labelFilterIds', next);
}
</script>
