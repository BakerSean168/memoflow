<script setup lang="ts">
/**
 * GoalCapsulePreview — 目标胶囊摘要（§10）
 * 懒加载 Goal-owned Home summary；短缓存只属于展示层。
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useGoalHomeSummary } from '../../../modules/goal/composables/useGoalHomeSummary';

const RECENT_LIMIT = 3;
const CACHE_MS = 45_000;

defineEmits<{
  'view-all': [];
  select: [id: string];
}>();

const { t } = useI18n();
const { goals: goalProgress, activeCount, isLoading, error, refresh } = useGoalHomeSummary();

const loadedAt = ref(0);
const localError = ref<string | null>(null);

const items = computed(() => goalProgress.value.slice(0, RECENT_LIMIT));

async function load(force = false) {
  if (!force && loadedAt.value && Date.now() - loadedAt.value < CACHE_MS) return;
  localError.value = null;
  await refresh();
  if (error.value) localError.value = error.value;
  loadedAt.value = Date.now();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="flex max-h-80 flex-col" data-testid="goal-capsule-preview">
    <div class="mb-2 flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
      <p class="text-xs font-bold">{{ t('nav.capsule.goal') }}</p>
      <span class="font-mono text-[10px] text-muted-foreground" data-testid="goal-capsule-count">
        {{ activeCount }}
      </span>
    </div>

    <div v-if="isLoading && items.length === 0" class="space-y-2 py-2" data-testid="goal-capsule-loading">
      <div v-for="i in 3" :key="i" class="space-y-1">
        <div class="h-3 w-3/4 animate-pulse rounded bg-muted" />
        <div class="h-2 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>

    <div
      v-else-if="localError"
      class="space-y-2 py-3 text-center"
      data-testid="goal-capsule-error"
    >
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
      class="py-4 text-center text-[11px] text-muted-foreground"
      data-testid="goal-capsule-empty"
    >
      {{ t('shell.preview.goalEmpty') }}
    </div>

    <ul v-else class="min-h-0 flex-1 space-y-1 overflow-y-auto" data-testid="goal-capsule-list">
      <li v-for="goal in items" :key="goal.id">
        <button
          type="button"
          class="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
          :data-testid="`goal-capsule-item-${goal.id}`"
          @click="$emit('select', String(goal.id))"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="truncate text-[11px] font-semibold leading-4">{{ goal.name }}</p>
            <span class="shrink-0 font-mono text-[10px] text-muted-foreground">{{ goal.progress }}%</span>
          </div>
          <div class="mt-1 h-1 overflow-hidden rounded-full bg-muted">
            <div class="h-full rounded-full bg-primary" :style="{ width: `${goal.progress}%` }" />
          </div>
        </button>
      </li>
    </ul>

    <button
      type="button"
      class="mt-2 block w-full rounded-lg border border-border/60 bg-accent py-1.5 text-center text-xs font-medium transition-colors hover:bg-accent/80"
      data-testid="goal-capsule-view-all"
      @click="$emit('view-all')"
    >
      {{ t('shell.enterModule') }}
    </button>
  </div>
</template>
