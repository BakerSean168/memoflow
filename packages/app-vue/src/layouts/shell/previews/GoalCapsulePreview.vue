<script setup lang="ts">
/**
 * Goal capsule quick workspace.
 *
 * Keeps attention-oriented Goal context in the header: nearest targets first,
 * progress, target window, and KR count. Editing remains Goal-owned.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowRight, Target } from '@lucide/vue';
import {
  goalTimeframeEndBoundary,
  goalTimeframeLabel,
  type GoalHomeProgressItem,
} from '@memoflow/contracts/goal';
import { useGoalHomeSummary } from '../../../modules/goal/composables/useGoalHomeSummary';

const DISPLAY_LIMIT = 5;

defineEmits<{
  'view-all': [];
  select: [id: string];
}>();

const { t, locale } = useI18n();
const { goals: goalProgress, activeCount, isLoading, error, ensure, refresh } =
  useGoalHomeSummary();

const localError = ref<string | null>(null);

const items = computed(() =>
  [...goalProgress.value]
    .sort((left, right) => {
      const leftTarget = targetSortKey(left);
      const rightTarget = targetSortKey(right);
      if (leftTarget !== rightTarget) return leftTarget.localeCompare(rightTarget);
      if (left.progress !== right.progress) return left.progress - right.progress;
      return left.name.localeCompare(right.name);
    })
    .slice(0, DISPLAY_LIMIT),
);

function targetSortKey(goal: GoalHomeProgressItem): string {
  return goal.target ? goalTimeframeEndBoundary(goal.target) : '9999-12-31';
}

function targetLabel(goal: GoalHomeProgressItem): string {
  return goal.target
    ? goalTimeframeLabel(goal.target, locale.value)
    : t('shell.goalWorkspace.noTarget');
}

async function load(force = false) {
  localError.value = null;
  if (force) await refresh();
  else await ensure();
  if (error.value) localError.value = error.value;
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div
    class="flex max-h-[30rem] min-h-0 flex-col"
    data-testid="goal-capsule-preview"
    data-capsule-workspace="goal"
  >
    <div class="flex items-center justify-between gap-3 border-b border-border/50 pb-2">
      <div>
        <p class="text-xs font-semibold text-foreground">{{ t('nav.capsule.goal') }}</p>
        <p class="mt-0.5 text-[10px] text-muted-foreground">
          {{ t('shell.goalWorkspace.attention') }}
        </p>
      </div>
      <span
        class="rounded-full bg-muted/70 px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
        data-testid="goal-capsule-count"
      >
        {{ activeCount }}
      </span>
    </div>

    <div
      v-if="isLoading && items.length === 0"
      class="space-y-1.5 py-3"
      data-testid="goal-capsule-loading"
    >
      <div v-for="i in 4" :key="i" class="h-12 animate-pulse rounded-lg bg-muted/70" />
    </div>

    <div v-else-if="localError" class="space-y-2 py-4 text-center" data-testid="goal-capsule-error">
      <p class="text-[11px] text-muted-foreground">{{ localError }}</p>
      <button
        type="button"
        class="text-[11px] font-medium text-primary"
        data-testid="goal-capsule-retry"
        @click="load(true)"
      >
        {{ t('common.retry') }}
      </button>
    </div>

    <div
      v-else-if="items.length === 0"
      class="flex flex-col items-center justify-center py-7 text-center"
      data-testid="goal-capsule-empty"
    >
      <Target class="mb-2 h-6 w-6 text-muted-foreground/45" />
      <p class="text-[11px] text-muted-foreground">{{ t('shell.preview.goalEmpty') }}</p>
    </div>

    <ul
      v-else
      class="min-h-0 flex-1 space-y-0.5 overflow-y-auto py-1.5 pr-0.5"
      data-testid="goal-capsule-list"
    >
      <li v-for="goal in items" :key="goal.id">
        <button
          type="button"
          class="w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/55"
          :data-testid="'goal-capsule-item-' + goal.id"
          @click="$emit('select', String(goal.id))"
        >
          <div class="flex min-w-0 items-center justify-between gap-2">
            <p class="min-w-0 flex-1 truncate text-[11px] font-medium leading-4">
              {{ goal.name }}
            </p>
            <span class="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              {{ goal.progress }}%
            </span>
          </div>

          <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-primary transition-[width] duration-300"
              :style="{ width: goal.progress + '%' }"
            />
          </div>

          <div
            class="mt-1.5 flex min-w-0 items-center justify-between gap-2 text-[10px] text-muted-foreground"
          >
            <span class="min-w-0 truncate">{{ targetLabel(goal) }}</span>
            <span class="shrink-0">
              {{ t('shell.goalWorkspace.krCount', { count: goal.keyResultCount }) }}
            </span>
          </div>
        </button>
      </li>
    </ul>

    <div class="flex shrink-0 justify-end border-t border-border/50 pt-2">
      <button
        type="button"
        class="flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        data-testid="goal-capsule-view-all"
        @click="$emit('view-all')"
      >
        {{ t('shell.goalWorkspace.viewAll') }}
        <ArrowRight class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>
