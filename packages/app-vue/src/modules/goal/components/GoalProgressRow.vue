<template>
  <ActionableWrapper
    :actions="actions"
    wrapper-class="w-full"
    more-button-position="center-right"
    menu-width="w-40"
    more-button-test-id="goal-row-more-actions"
    :more-button-label="t('goal.list.moreActions')"
    more-button-class="!border-transparent !bg-transparent !shadow-none !backdrop-blur-none hover:!bg-[hsl(var(--hover))]"
  >
    <article
      class="border-b border-[hsl(var(--border-subtle))] last:border-b-0"
      data-testid="goal-progress-row"
      :data-goal-id="goal.id"
    >
      <button
        type="button"
        class="w-full text-left transition-colors hover:bg-[hsl(var(--hover)/0.5)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/60"
        :data-keyboard-item="String(goal.id)"
        @click="emit('view')"
      >
        <div
          class="hidden min-h-14 grid-cols-[minmax(0,1fr)_6.5rem_8.5rem_10rem] items-center gap-x-6 px-3 py-2.5 pr-12 @2xl/panel:grid"
          data-testid="goal-row-desktop"
        >
          <div class="min-w-0">
            <div class="flex min-w-0 items-center gap-2">
              <h3
                class="min-w-0 truncate text-sm font-medium text-foreground"
                data-testid="goal-row-title"
              >
                {{ goal.name }}
              </h3>
              <Badge
                v-if="statusLabel"
                variant="secondary"
                class="h-5 shrink-0 px-1.5 py-0 text-[10px]"
              >
                {{ statusLabel }}
              </Badge>
            </div>

            <div
              v-if="goal.summary || visibleLabels.length"
              class="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground"
            >
              <span v-if="goal.summary" class="min-w-0 truncate">{{ goal.summary }}</span>
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

          <div
            class="text-sm tabular-nums text-muted-foreground"
            data-testid="goal-row-key-results"
          >
            {{ goal.completedKeyResults }} / {{ goal.totalKeyResults }}
          </div>

          <div
            class="truncate text-sm tabular-nums"
            :class="isPastTarget ? 'text-destructive/85' : 'text-muted-foreground'"
            data-testid="goal-row-target"
          >
            {{ targetText || '—' }}
            <span v-if="isPastTarget" class="sr-only"> {{ t('goal.list.pastTarget') }}</span>
          </div>

          <div
            class="grid min-w-0 grid-cols-[2.5rem_5rem] items-center gap-2"
            data-testid="goal-row-progress"
          >
            <span class="text-right text-sm font-medium tabular-nums text-foreground">
              {{ progress }}%
            </span>
            <Progress :model-value="progress" class="h-1 w-full" />
          </div>
        </div>

        <div class="px-1 py-4 pr-12 @2xl/panel:hidden" data-testid="goal-row-compact">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex min-w-0 items-center gap-2">
                <h3 class="truncate text-sm font-medium text-foreground">{{ goal.name }}</h3>
                <Badge
                  v-if="statusLabel"
                  variant="secondary"
                  class="h-5 shrink-0 px-1.5 py-0 text-[10px]"
                >
                  {{ statusLabel }}
                </Badge>
              </div>
              <p v-if="goal.summary" class="mt-1 truncate text-xs text-muted-foreground">
                {{ goal.summary }}
              </p>
            </div>
            <span class="shrink-0 text-sm font-semibold tabular-nums">{{ progress }}%</span>
          </div>

          <Progress :model-value="progress" class="mt-3 h-1.5" />

          <div class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span
              >{{ goal.completedKeyResults }}/{{ goal.totalKeyResults }}
              {{ t('goal.list.keyResultsColumn') }}</span
            >
            <span v-if="targetText" aria-hidden="true">·</span>
            <span
              v-if="targetText"
              class="truncate tabular-nums"
              :class="isPastTarget ? 'text-destructive/85' : ''"
            >
              {{ targetText }}
              <span v-if="isPastTarget" class="sr-only"> {{ t('goal.list.pastTarget') }}</span>
            </span>
          </div>
        </div>
      </button>
    </article>
  </ActionableWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Pencil, Trash2 } from '@lucide/vue';
import { goalTimeframeLabel, isPastGoalTarget, type GoalClientDTO } from '@memoflow/contracts/goal';
import { Badge, Progress } from '@memoflow/ui-vue-shadcn';
import { ActionableWrapper, type MenuAction } from '../../../components/shared';
import { getProductTodayYmd } from '../../../shared/utils/product-time';
import { getGoalOverallProgress } from '../utils/progress';

const props = defineProps<{ goal: GoalClientDTO }>();
const emit = defineEmits<{ view: []; edit: []; delete: [] }>();
const { t, locale } = useI18n();

const progress = computed(() => getGoalOverallProgress(props.goal));
const isPastTarget = computed(
  () =>
    (props.goal.status === 'Planned' || props.goal.status === 'InProgress') &&
    isPastGoalTarget(props.goal.target, getProductTodayYmd()),
);
const statusLabel = computed(() => {
  if (props.goal.status === 'Completed') return t('goal.list.completed');
  if (props.goal.status === 'Abandoned') return t('goal.list.abandoned');
  return '';
});
const targetText = computed(() =>
  props.goal.target ? goalTimeframeLabel(props.goal.target, locale.value) : '',
);
const visibleLabels = computed(() => (props.goal.labels ?? []).slice(0, 2));
const hiddenLabelCount = computed(() => Math.max(0, (props.goal.labels?.length ?? 0) - 2));
const actions = computed<MenuAction[]>(() => [
  {
    key: 'edit',
    label: t('common.edit'),
    icon: Pencil,
    handler: () => emit('edit'),
  },
  {
    key: 'delete',
    label: t('common.delete'),
    icon: Trash2,
    destructive: true,
    separator: true,
    handler: () => emit('delete'),
  },
]);
</script>
