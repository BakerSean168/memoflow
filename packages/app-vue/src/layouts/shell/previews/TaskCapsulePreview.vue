<script setup lang="ts">
/**
 * TaskCapsulePreview — 任务胶囊摘要（§10）
 * 复用今日实例拉取逻辑；不在 header mount 时请求，仅首次打开加载。
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTask } from '../../../modules/task/composables/useTask';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import { formatHHmmParts } from '../../../shared/utils/format-hhmm-parts';
import { startOfDayMs, endOfDayMs, isTodayMs } from '../../../shared/utils/product-time';

const RECENT_LIMIT = 3;
const CACHE_MS = 45_000;
const TEMPLATE_FETCH_LIMIT = 200;

defineEmits<{
  'view-all': [];
  select: [id: string];
}>();

const { t } = useI18n();
const task = useTask();

const loadedAt = ref(0);
const localError = ref<string | null>(null);
const isLoading = ref(false);

function getTodayRange() {
  const now = new Date();
  return {
    startDate: startOfDayMs(now.getTime()),
    endDate: endOfDayMs(now.getTime()),
  };
}

const todayInstances = computed<TaskOccurrenceClientDTO[]>(() => {
  return (task.instances.value ?? []).filter((inst) =>
    isTodayMs(inst.instanceDate),
  );
});

const pending = computed(() =>
  todayInstances.value
    .filter((i) => i.status !== 'Completed' && i.status !== 'Skipped' && i.status !== 'Missed')
    .slice(0, RECENT_LIMIT),
);

const completedCount = computed(
  () => todayInstances.value.filter((i) => i.status === 'Completed').length,
);

const templateMap = computed(() => {
  const map = new Map<string, TaskPlanClientDTO>();
  for (const tpl of task.templates.value ?? []) {
    map.set(String(tpl.id), tpl);
  }
  return map;
});

/** Residual 1297: minutes-of-day HH:mm dual retired onto formatHHmmParts sole. */
function timeLabel(inst: TaskOccurrenceClientDTO): string {
  const fmt = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return formatHHmmParts(h, m);
  };
  const tr = inst.timeConfig?.timeRange;
  if (tr && typeof tr.start === 'number') return fmt(tr.start);
  const tp = inst.timeConfig?.timePoint;
  if (typeof tp === 'number') return fmt(tp);
  return t('shell.preview.allDay');
}

function titleOf(inst: TaskOccurrenceClientDTO): string {
  const tpl = templateMap.value.get(String(inst.templateId));
  return tpl?.name || String(inst.templateId);
}

async function load(force = false) {
  if (!force && loadedAt.value && Date.now() - loadedAt.value < CACHE_MS) return;
  isLoading.value = true;
  localError.value = null;
  try {
    const range = getTodayRange();
    await Promise.all([
      task.fetchInstancesByDateRange(range.startDate, range.endDate),
      task.fetchTemplates({ page: 1, limit: TEMPLATE_FETCH_LIMIT }),
    ]);
    if (task.error?.value) localError.value = String(task.error.value);
    loadedAt.value = Date.now();
  } catch (e) {
    localError.value = e instanceof Error ? e.message : t('common.operationFailed');
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="flex max-h-80 flex-col" data-testid="task-capsule-preview">
    <div class="mb-2 flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
      <p class="text-xs font-bold">{{ t('nav.capsule.task') }}</p>
      <span class="font-mono text-[10px] text-muted-foreground" data-testid="task-capsule-count">
        {{ completedCount }}/{{ todayInstances.length }}
      </span>
    </div>

    <div v-if="isLoading && pending.length === 0" class="space-y-2 py-2" data-testid="task-capsule-loading">
      <div v-for="i in 3" :key="i" class="h-8 animate-pulse rounded bg-muted" />
    </div>

    <div v-else-if="localError" class="space-y-2 py-3 text-center" data-testid="task-capsule-error">
      <p class="text-[11px] text-muted-foreground">{{ localError }}</p>
      <button type="button" class="text-[11px] font-medium text-primary" data-testid="task-capsule-retry" @click="load(true)">
        {{ t('common.retry') }}
      </button>
    </div>

    <div
      v-else-if="todayInstances.length === 0"
      class="py-4 text-center text-[11px] text-muted-foreground"
      data-testid="task-capsule-empty"
    >
      {{ t('shell.preview.taskEmpty') }}
    </div>

    <ul v-else class="min-h-0 flex-1 space-y-1 overflow-y-auto" data-testid="task-capsule-list">
      <li v-for="inst in pending" :key="inst.id">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
          :data-testid="`task-capsule-item-${inst.id}`"
          @click="$emit('select', String(inst.id))"
        >
          <span class="shrink-0 font-mono text-[10px] text-muted-foreground">{{ timeLabel(inst) }}</span>
          <span class="min-w-0 flex-1 truncate text-[11px] font-medium">{{ titleOf(inst) }}</span>
        </button>
      </li>
      <li v-if="pending.length === 0" class="py-2 text-center text-[11px] text-muted-foreground">
        {{ t('shell.preview.taskAllDone') }}
      </li>
    </ul>

    <button
      type="button"
      class="mt-2 block w-full rounded-lg border border-border/60 bg-accent py-1.5 text-center text-xs font-medium transition-colors hover:bg-accent/80"
      data-testid="task-capsule-view-all"
      @click="$emit('view-all')"
    >
      {{ t('shell.enterModule') }}
    </button>
  </div>
</template>
