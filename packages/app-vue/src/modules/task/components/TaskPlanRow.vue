<template>
  <ActionableWrapper
    :actions="actions"
    wrapper-class="w-full"
    more-button-position="center-right"
    menu-width="w-44"
    more-button-test-id="task-plan-row-more-actions"
    :more-button-label="t('task.management.moreActions')"
    more-button-class="!border-transparent !bg-transparent !shadow-none !backdrop-blur-none hover:!bg-[hsl(var(--hover))]"
  >
    <article
      class="border-b border-[hsl(var(--border-subtle))] last:border-b-0"
      data-testid="task-plan-row"
      :data-task-id="plan.id"
    >
      <button
        type="button"
        class="w-full text-left transition-colors hover:bg-[hsl(var(--hover)/0.5)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/60"
        @click="emit('view')"
      >
        <div
          class="hidden min-h-14 grid-cols-[minmax(0,1fr)_11rem_8rem_10rem] items-center gap-x-6 px-3 py-2.5 pr-12 @2xl/panel:grid"
          data-testid="task-plan-row-desktop"
        >
          <div class="min-w-0">
            <div class="flex min-w-0 items-center gap-2">
              <h3 class="min-w-0 truncate text-sm font-medium text-foreground">
                {{ plan.title }}
              </h3>
              <Badge variant="secondary" class="h-5 shrink-0 px-1.5 py-0 text-[10px] font-normal">
                {{ plan.stateText ?? plan.statusText }}
              </Badge>
            </div>
            <div
              v-if="plan.description || plan.labels?.length || plan.importanceText"
              class="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground"
            >
              <span v-if="plan.description" class="min-w-0 truncate">{{ plan.description }}</span>
              <span v-if="plan.importanceText" class="shrink-0">{{ plan.importanceText }}</span>
              <span
                v-for="label in visibleLabels"
                :key="label.id"
                class="inline-flex shrink-0 items-center gap-1"
              >
                <span
                  v-if="label.color"
                  class="h-1.5 w-1.5 rounded-full border border-[hsl(var(--border-subtle))]"
                  :style="{ backgroundColor: label.color }"
                  aria-hidden="true"
                />
                #{{ label.name }}
              </span>
              <span v-if="hiddenLabelCount" class="shrink-0">+{{ hiddenLabelCount }}</span>
            </div>
          </div>

          <div class="min-w-0">
            <p class="truncate text-sm text-foreground/90">{{ scheduleText }}</p>
            <p class="mt-0.5 truncate text-[11px] text-muted-foreground">
              {{ plan.recurrenceText }}
            </p>
          </div>

          <div class="truncate text-sm text-muted-foreground">
            {{ plan.goalBinding ? t('task.occurrence.goalLinked') : '—' }}
          </div>

          <div class="grid min-w-0 grid-cols-[2.5rem_5rem] items-center gap-2">
            <span class="text-right text-sm font-medium tabular-nums text-foreground">
              {{ progress }}%
            </span>
            <Progress :model-value="progress" class="h-1 w-full" />
          </div>
        </div>

        <div class="px-1 py-4 pr-12 @2xl/panel:hidden" data-testid="task-plan-row-compact">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex min-w-0 items-center gap-2">
                <h3 class="truncate text-sm font-medium text-foreground">{{ plan.title }}</h3>
                <Badge variant="secondary" class="h-5 shrink-0 px-1.5 py-0 text-[10px] font-normal">
                  {{ plan.stateText ?? plan.statusText }}
                </Badge>
              </div>
              <p v-if="plan.description" class="mt-1 truncate text-xs text-muted-foreground">
                {{ plan.description }}
              </p>
            </div>
            <span class="shrink-0 text-sm font-semibold tabular-nums">{{ progress }}%</span>
          </div>
          <Progress :model-value="progress" class="mt-3 h-1.5" />
          <div class="mt-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span class="truncate">{{ scheduleText }}</span>
            <span aria-hidden="true">·</span>
            <span class="truncate">{{ plan.recurrenceText }}</span>
          </div>
        </div>
      </button>
    </article>
  </ActionableWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CircleStop, Trash2 } from '@lucide/vue';
import { Badge, Progress } from '@memoflow/ui-vue-shadcn';
import { ActionableWrapper, type MenuAction } from '../../../components/shared';
import type { TaskPlanViewModel } from './types';
import {
  getTaskPlanScheduleDate,
  getTaskPlanScheduleTimeDisplay,
} from '../utils/task-plan-presentation';

const props = defineProps<{ plan: TaskPlanViewModel }>();
const emit = defineEmits<{ view: []; abandon: []; delete: [] }>();
const { t } = useI18n();

const progress = computed(() =>
  Math.max(0, Math.min(100, Math.round(props.plan.completionRate ?? 0))),
);
const visibleLabels = computed(() => (props.plan.labels ?? []).slice(0, 2));
const hiddenLabelCount = computed(() => Math.max(0, (props.plan.labels?.length ?? 0) - 2));
const scheduleText = computed(
  () =>
    `${getTaskPlanScheduleDate(props.plan.schedule)} · ${getTaskPlanScheduleTimeDisplay(
      t,
      props.plan.schedule,
    )}`,
);
const actions = computed<MenuAction[]>(() => {
  const items: MenuAction[] = [];
  if (!props.plan.isArchived && (props.plan.isActive || props.plan.isPaused)) {
    items.push({
      key: 'abandon',
      label: t('task.action.abandon'),
      icon: CircleStop,
      handler: () => emit('abandon'),
    });
  }
  items.push({
    key: 'delete',
    label: t('common.delete'),
    icon: Trash2,
    destructive: true,
    separator: items.length > 0,
    handler: () => emit('delete'),
  });
  return items;
});
</script>
