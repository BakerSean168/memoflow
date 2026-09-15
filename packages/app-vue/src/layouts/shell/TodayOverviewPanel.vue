<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import { Plus, Target } from '@lucide/vue';
import DailyTodoWidget from '../../modules/task/components/widgets/DailyTodoWidget.vue';
import UpcomingRemindersWidget from '../../modules/reminder/components/widgets/UpcomingRemindersWidget.vue';
import GoalProgressWidget from '../../modules/goal/components/widgets/GoalProgressWidget.vue';
import { useDashboard } from '../../modules/dashboard/composables/useDashboard';
import { getProductTime, productTimeRevision } from '../../shared/utils/product-time';

const props = defineProps<{ active: boolean }>();

const emit = defineEmits<{
  (e: 'open-route', module: 'goal' | 'task' | 'reminder', route: string): void;
}>();

const { t } = useI18n();
const { goalProgress, isLoading, fetchDashboard } = useDashboard();
const dashboardReconciliationDelays = [0, 250, 500, 1_000, 2_000] as const;
let dashboardRefreshGeneration = 0;

const todayLabel = computed(() => {
  void productTimeRevision.value;
  return getProductTime().format.pattern(Date.now(), 'MMMM d, EEE');
});

watch(
  () => props.active,
  (active) => {
    if (active) void fetchDashboard();
  },
  { immediate: true },
);

async function refreshAfterTaskCompletion() {
  const generation = ++dashboardRefreshGeneration;
  for (const delay of dashboardReconciliationDelays) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (generation !== dashboardRefreshGeneration) return;
    await fetchDashboard();
  }
}

onBeforeUnmount(() => {
  dashboardRefreshGeneration++;
});
</script>

<template>
  <section
    class="h-full min-h-0 overflow-y-auto bg-background"
    data-testid="today-overview-panel"
    data-scroll-host="home"
  >
    <header
      class="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-4 backdrop-blur-sm"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="text-base font-semibold text-foreground">
            {{ t('shell.home.title') }}
          </h2>
          <p class="mt-0.5 text-xs text-muted-foreground">{{ todayLabel }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1.5" :aria-label="t('shell.home.directActions')">
          <Button
            variant="outline"
            size="sm"
            class="h-8 px-2.5"
            data-testid="today-overview-create-goal"
            @click="emit('open-route', 'goal', '/goals?dialog=goal')"
          >
            <Target class="mr-1.5 h-3.5 w-3.5" />
            {{ t('shell.home.newGoal') }}
          </Button>
          <Button
            size="sm"
            class="h-8 px-2.5"
            data-testid="today-overview-create-task"
            @click="emit('open-route', 'task', '/tasks?dialog=quick-task')"
          >
            <Plus class="mr-1.5 h-3.5 w-3.5" />
            {{ t('shell.home.quickTask') }}
          </Button>
        </div>
      </div>
    </header>

    <div class="grid gap-3 p-3" data-testid="today-overview-widgets">
      <DailyTodoWidget
        class="min-h-[9rem]"
        :active="active"
        @view-all="emit('open-route', 'task', '/tasks')"
        @completed="refreshAfterTaskCompletion"
      />
      <UpcomingRemindersWidget
        class="min-h-[9rem]"
        :refresh-key="0"
        @view-all="emit('open-route', 'reminder', '/reminders')"
      />
      <GoalProgressWidget
        class="min-h-[9rem]"
        :goals="goalProgress"
        :loading="isLoading"
        @view-all="emit('open-route', 'goal', '/goals')"
        @select="(id) => emit('open-route', 'goal', `/goals/${id}`)"
      />
    </div>
  </section>
</template>
