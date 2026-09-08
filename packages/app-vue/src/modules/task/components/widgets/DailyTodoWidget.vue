<template>
  <Card class="border-border/50 flex flex-col" data-testid="daily-todo-widget">
    <CardHeader class="pb-2 px-4 pt-4 flex flex-row items-center justify-between shrink-0">
      <CardTitle class="text-sm font-medium text-foreground flex items-center gap-2">
        <ListTodo class="w-4 h-4 text-muted-foreground" />
        今日待办
      </CardTitle>
      <div class="flex items-center gap-2">
        <!-- Progress text -->
        <span class="text-[11px] text-muted-foreground font-mono" data-testid="daily-todo-progress">
          {{ completedCount }}/{{ todayInstances.length }}
        </span>
        <Button variant="ghost" size="sm" class="h-7 text-xs" @click="$emit('view-all')">
          查看全部
          <ArrowRight class="w-3 h-3 ml-1" />
        </Button>
      </div>
    </CardHeader>

    <!-- Progress bar -->
    <div class="px-4 pb-2 shrink-0">
      <div class="h-1 rounded-full bg-muted overflow-hidden">
        <div
          class="h-full rounded-full bg-emerald-500 transition-all duration-500"
          :style="{ width: progressPct + '%' }"
          :data-progress="progressPct"
          data-testid="daily-todo-progress-bar"
        />
      </div>
    </div>

    <CardContent class="px-4 pb-4 flex-1 overflow-hidden">
      <!-- Loading skeleton -->
      <template v-if="isLoading">
        <div class="space-y-2">
          <div v-for="i in 5" :key="i" class="flex items-center gap-3">
            <Skeleton class="h-4 w-4 rounded-full shrink-0" />
            <Skeleton class="h-3 flex-1" />
            <Skeleton class="h-3 w-12" />
          </div>
        </div>
      </template>

      <!-- Empty state -->
      <template v-else-if="todayInstances.length === 0">
        <div class="flex flex-col items-center justify-center py-6 text-center">
          <CheckCircle2 class="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p class="text-xs text-muted-foreground">今日暂无任务安排</p>
        </div>
      </template>

      <!-- Task list -->
      <template v-else>
        <ScrollArea class="h-[200px]">
          <div class="space-y-0.5 pr-2">
            <div
              v-for="inst in sortedInstances"
              :key="inst.id"
              class="group flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-muted/50 transition-colors"
              :class="{ 'opacity-50': inst.status === 'Completed' || inst.status === 'Skipped' }"
              data-testid="daily-todo-item"
              :data-task-occurrence-id="inst.id"
              :data-task-status="inst.status"
            >
              <!-- Complete button (circle dot) -->
              <button
                type="button"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :class="completeBtnClass(inst.status)"
                :disabled="
                  inst.status === 'Skipped' || inst.status === 'Missed' || completing === inst.id
                "
                :title="inst.status === 'Completed' ? '撤销完成' : '标记完成'"
                :aria-label="inst.status === 'Completed' ? '撤销完成' : '标记完成'"
                :data-testid="`complete-today-task-${inst.id}`"
                @click.stop="handleComplete(inst)"
              >
                <Check v-if="inst.status === 'Completed'" class="w-2.5 h-2.5 text-white" />
                <Loader2
                  v-else-if="completing === inst.id"
                  class="w-2.5 h-2.5 text-muted-foreground animate-spin"
                />
              </button>

              <!-- Task title -->
              <span
                class="flex-1 min-w-0 text-xs text-foreground truncate"
                :class="{ 'line-through text-muted-foreground': inst.status === 'Completed' }"
              >
                {{ templateName(inst.templateId) }}
              </span>

              <!-- Time label -->
              <span class="shrink-0 text-[10px] text-muted-foreground font-mono">
                {{ timeLabel(inst) }}
              </span>

              <!-- Status badge (Skipped / Missed) -->
              <span
                v-if="inst.status === 'Skipped' || inst.status === 'Missed'"
                class="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium"
                :class="{
                  'bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground':
                    inst.status === 'Skipped',
                  'bg-destructive/15 text-destructive dark:bg-destructive/30 dark:text-destructive':
                    inst.status === 'Missed',
                }"
              >
                {{ inst.status === 'Skipped' ? '已跳过' : '已错过' }}
              </span>
            </div>
          </div>
        </ScrollArea>
      </template>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { startOfDayMs, endOfDayMs, isTodayMs } from '../../../../shared/utils/product-time';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Skeleton,
  ScrollArea,
} from '@memoflow/ui-vue-shadcn';
import { ListTodo, ArrowRight, CheckCircle2, Check, Loader2 } from '@lucide/vue';
import { useTask } from '../../composables/useTask';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import { formatHHmmParts } from '../../../../shared/utils/format-hhmm-parts';

const emit = defineEmits<{
  (e: 'view-all'): void;
  (e: 'completed', instance: TaskOccurrenceClientDTO): void;
}>();

const props = withDefaults(
  defineProps<{
    /** Home keeps this widget mounted while other shell surfaces are active. */
    active?: boolean;
  }>(),
  { active: true },
);

const task = useTask();
const completing = ref<string | null>(null);

const TEMPLATE_FETCH_LIMIT = 200;

function getTodayRange(): { startDate: number; endDate: number } {
  const now = new Date();
  return {
    startDate: startOfDayMs(now.getTime()),
    endDate: endOfDayMs(now.getTime()),
  };
}

async function loadToday() {
  const todayRange = getTodayRange();
  await Promise.all([
    task.fetchInstancesByDateRange(todayRange.startDate, todayRange.endDate),
    task.fetchTemplates({ page: 1, limit: TEMPLATE_FETCH_LIMIT }),
  ]);
}

// Home keeps this widget mounted while other shell surfaces are active. Refresh
// when the surface becomes active again so task creation in another tab is visible.
onMounted(() => {
  if (props.active) void loadToday();
});
watch(
  () => props.active,
  (active, wasActive) => {
    if (active && !wasActive) void loadToday();
  },
);

const isLoading = computed(() => task.isLoading.value);

// ── Derive today's instances ──
const todayInstances = computed<TaskOccurrenceClientDTO[]>(() => {
  return (task.instances.value ?? []).filter((inst) => {
    return isTodayMs(inst.instanceDate);
  });
});

// Sort: Pending/InProgress first (by time), then Completed/Skipped/Missed
const sortedInstances = computed(() => {
  const active = todayInstances.value.filter(
    (i) => i.status !== 'Completed' && i.status !== 'Skipped' && i.status !== 'Missed',
  );
  const done = todayInstances.value.filter(
    (i) => i.status === 'Completed' || i.status === 'Skipped' || i.status === 'Missed',
  );
  const byTime = (a: TaskOccurrenceClientDTO, b: TaskOccurrenceClientDTO) => {
    const ta = a.timeConfig?.timeRange?.start ?? a.timeConfig?.timePoint ?? 0;
    const tb = b.timeConfig?.timeRange?.start ?? b.timeConfig?.timePoint ?? 0;
    return (ta ?? 0) - (tb ?? 0);
  };
  return [...active.sort(byTime), ...done.sort(byTime)];
});

const completedCount = computed(
  () => todayInstances.value.filter((i) => i.status === 'Completed').length,
);

const progressPct = computed(() => {
  const total = todayInstances.value.length;
  if (total === 0) return 0;
  return Math.round((completedCount.value / total) * 100);
});

// ── Template name lookup ──
const templateMap = computed<Map<string, TaskPlanClientDTO>>(() => {
  return new Map((task.templates.value ?? []).map((t) => [t.id, t]));
});

function templateName(templateId: string): string {
  return templateMap.value.get(templateId)?.name ?? templateId;
}

// ── Time label ──
/** Residual 1297: minutes-of-day HH:mm dual retired onto formatHHmmParts sole. */
function timeLabel(inst: TaskOccurrenceClientDTO): string {
  const fmt = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return formatHHmmParts(h, m);
  };
  const tr = inst.timeConfig?.timeRange;
  if (tr && typeof tr.start === 'number') {
    return fmt(tr.start);
  }
  const tp = inst.timeConfig?.timePoint;
  if (typeof tp === 'number') {
    return fmt(tp);
  }
  return '全天';
}

// ── Complete button style ──
function completeBtnClass(status: string): string {
  if (status === 'Completed') {
    return 'border-emerald-500 bg-emerald-500 cursor-default';
  }
  if (status === 'Skipped' || status === 'Missed') {
    return 'border-muted-foreground/30 bg-muted cursor-default';
  }
  return 'border-muted-foreground/50 bg-transparent hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer';
}

// ── Complete handler ──
async function handleComplete(inst: TaskOccurrenceClientDTO) {
  if (completing.value || inst.status === 'Skipped' || inst.status === 'Missed') return;
  completing.value = inst.id;
  try {
    if (inst.status === 'Completed') {
      await task.uncompleteInstance(inst.id);
    } else {
      const completed = await task.completeInstance(inst.id);
      if (completed) {
        emit('completed', completed);
      }
    }
  } finally {
    completing.value = null;
  }
}
</script>
