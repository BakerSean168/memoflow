<template>
  <div
    class="task-management-view flex h-full min-h-0 flex-col bg-background"
    data-testid="task-management-view"
  >
    <TaskPageToolbar
      :active-surface="activeSurface"
      :visible-item-count="visibleItemCount"
      :occurrence-status-filter="occurrenceStatusFilter"
      :plan-state-filter="planStateFilter"
      :label-filter-ids="labelFilterIds"
      :label-options="availableLabels"
      :occurrence-sort="occurrenceSort"
      :goal-scope-label="goalScopeLabel"
      @update:active-surface="activeSurface = $event"
      @update:occurrence-status-filter="occurrenceStatusFilter = $event"
      @update:plan-state-filter="planStateFilter = $event"
      @update:label-filter-ids="labelFilterIds = $event"
      @update:occurrence-sort="occurrenceSort = $event"
      @clear-goal-scope="clearGoalScope"
      @create-task="openCreateDialog"
    />

    <main
      class="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 @md/panel:px-5 @md/panel:py-4"
      data-scroll-host="task-management"
      data-testid="task-management-scroll-host"
    >
      <div class="flex w-full flex-col">
        <div
          v-if="isLoading"
          class="flex min-h-64 items-center justify-center text-sm text-muted-foreground"
          data-testid="task-loading-state"
        >
          <Loader2 class="mr-2 h-5 w-5 animate-spin" />
          {{ t('task.status.loading') }}
        </div>

        <div
          v-else-if="loadError"
          class="flex min-h-64 flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 text-center"
          data-testid="task-error-state"
        >
          <CircleAlert class="mb-3 h-7 w-7 text-destructive" />
          <h2 class="font-semibold">{{ t('task.error.loadFailedTitle') }}</h2>
          <p class="mt-1 max-w-lg text-sm text-muted-foreground">
            {{ t('task.error.loadFailedDescription') }}
          </p>
          <Button class="mt-4" size="sm" variant="outline" @click="reloadSurface">
            <RefreshCw class="mr-2 h-4 w-4" />
            {{ t('task.action.retry') }}
          </Button>
        </div>

        <template v-else-if="activeSurface === 'plans'">
          <div v-if="filteredPlans.length" data-testid="task-plan-list">
            <div
              class="hidden grid-cols-[minmax(0,1fr)_11rem_8rem_10rem] items-center gap-x-6 border-b border-[hsl(var(--border-subtle))] px-3 py-2 pr-12 text-[11px] font-medium text-muted-foreground @2xl/panel:grid"
              data-testid="task-plan-list-column-header"
            >
              <span>{{ t('task.management.planColumn') }}</span>
              <span>{{ t('task.management.scheduleColumn') }}</span>
              <span>{{ t('task.management.goalColumn') }}</span>
              <div class="grid grid-cols-[2.5rem_5rem] items-center gap-2">
                <span class="text-right">{{ t('task.management.progressColumn') }}</span>
                <span aria-hidden="true" />
              </div>
            </div>
            <TaskPlanRow
              v-for="template in filteredPlans"
              :key="template.id"
              :plan="template"
              @view="openTaskDetail(template.id)"
              @abandon="abandon(template.id)"
              @delete="remove(template)"
            />
          </div>
          <div
            v-else
            class="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center"
            data-testid="task-plans-empty-state"
          >
            <ListChecks class="mb-3 h-8 w-8 text-muted-foreground" />
            <h2 class="font-semibold">{{ t('task.management.emptyPlans') }}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ t('task.management.emptyPlansDescription') }}
            </p>
          </div>
          <div
            v-if="planTotal > 100 || planPage > 1"
            class="mt-4 flex items-center justify-end gap-3"
            data-testid="task-plan-pagination"
          >
            <Button variant="outline" size="sm" :disabled="planPage <= 1" @click="planPage--">
              {{ t('task.management.previousPage') }}
            </Button>
            <span class="text-sm tabular-nums"
              >{{ planPage }} / {{ Math.max(1, Math.ceil(planTotal / 100)) }}</span
            >
            <Button
              variant="outline"
              size="sm"
              :disabled="planPage * 100 >= planTotal"
              @click="planPage++"
            >
              {{ t('task.management.nextPage') }}
            </Button>
          </div>
        </template>

        <template v-else>
          <div
            v-if="visibleOccurrences.length"
            class="space-y-4"
            data-testid="task-occurrence-list"
          >
            <section
              v-for="group in occurrenceGroups"
              :key="group.key"
              :data-testid="`task-occurrence-group-${group.key}`"
            >
              <div class="flex items-center gap-2 border-b border-[hsl(var(--border-subtle))] px-1 pb-2">
                <h2 class="text-xs font-medium text-muted-foreground">
                  {{ group.label }}
                </h2>
                <span class="text-[11px] tabular-nums text-muted-foreground/80">
                  {{ group.occurrences.length }}
                </span>
              </div>
              <div class="border-b border-[hsl(var(--border-subtle))]">
                <TaskOccurrenceRow
                  v-for="occurrence in group.occurrences"
                  :key="occurrence.id"
                  :occurrence="occurrence"
                  :template="templateById.get(String(occurrence.planId))!"
                  :busy="busyOccurrenceId === String(occurrence.id)"
                  @open-plan="openTaskDetail"
                  @complete="completeOccurrence"
                  @uncomplete="uncompleteOccurrence"
                  @missed="markOccurrenceMissed"
                  @skip="skipOccurrence"
                  @checklist-change="setOccurrenceChecklistItem"
                />
              </div>
            </section>
          </div>
          <div
            v-else
            class="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center"
            data-testid="task-occurrences-empty-state"
          >
            <CalendarCheck2 class="mb-3 h-8 w-8 text-muted-foreground" />
            <h2 class="font-semibold">{{ t('task.management.emptyToday') }}</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ t('task.management.emptyOccurrenceDescription') }}
            </p>
          </div>

          <div class="mt-4 flex items-center justify-between gap-3 border-t border-[hsl(var(--border-subtle))] pt-3">
            <p class="text-xs text-muted-foreground">
              {{ t('task.management.futureInSchedule') }}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="shrink-0"
              data-testid="task-open-schedule"
              @click="openSchedule"
            >
              <CalendarDays class="mr-1.5 h-4 w-4" />
              {{ t('task.management.viewSchedule') }}
              <ArrowRight class="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </template>
      </div>
    </main>

    <TaskPlanDialog
      v-model="showDialog"
      mode="create"
      :template="null"
      :saving="isSaving"
      :initial-goal-binding="createInitialGoalBinding"
      @save="handleSubmit"
      @cancel="closeDialog"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Button, useConfirm } from '@memoflow/ui-vue-shadcn';
import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CircleAlert,
  ListChecks,
  Loader2,
  RefreshCw,
} from '@lucide/vue';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import type { GoalId, KeyResultId } from '@memoflow/contracts/primitives';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import TaskOccurrenceRow from '../components/TaskOccurrenceRow.vue';
import TaskPageToolbar from '../components/TaskPageToolbar.vue';
import TaskPlanRow from '../components/TaskPlanRow.vue';
import TaskPlanDialog from '../components/dialogs/TaskPlanDialog.vue';
import type {
  TaskPlanStateFilter,
  TaskPlanViewModel,
  TaskSurface,
} from '../components/types';
import { useTaskStore } from '../stores/task-store';
import { useTaskOccurrences } from '../composables/useTaskOccurrences';
import { useTaskPlanListQuery } from '../composables/useTaskPlanListQuery';
import { useTaskPlanMutations } from '../composables/useTaskPlanMutations';
import {
  mapTaskPlanDtoToViewModel,
  toTaskPlanSchedulePayload,
} from '../utils/task-plan-presentation';
import {
  isTaskOccurrenceOnTodaySurface,
  isTaskOccurrenceOverdue,
  sortTaskOccurrences,
  type TaskOccurrenceSort,
} from '../utils/task-occurrence-presentation';
import { endOfDayMs, isTodayMs, startOfDayMs } from '../../../shared/utils/product-time';
import { GOAL_SERVICE_KEY, TASK_SERVICE_KEY } from '../../../di/keys';
import { unwrap } from '@memoflow/contracts/result';
import { taskPlanQueryKeys, type TaskPlanListQueryInput } from '../../../platform/server-state/query-keys';
import { TASK_TEMPLATE_STALE_TIME_MS } from '../../../platform/server-state/query-policy';
import { useServerStateIdentityScope, useServerStateRuntime } from '../../../platform/server-state';
import { useStrictInject } from '../../../shared/utils/useStrictInject';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const goalService = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');

const resolveIdentityScope = useServerStateIdentityScope();
const runtime = useServerStateRuntime();
const taskService = useStrictInject(TASK_SERVICE_KEY, 'TaskService');
const planPage = ref(1);
const todayDetailsLoading = ref(false);
const todayDetailsError = ref(false);
let todayRequest = 0;

const activeSurface = ref<TaskSurface>('today');
const occurrenceStatusFilter = ref<'all' | TaskOccurrenceClientDTO['status']>('all');
const planStateFilter = ref<TaskPlanStateFilter>('all');
const labelFilterIds = ref<string[]>([]);
const occurrenceSort = ref<TaskOccurrenceSort>('time');
const showDialog = ref(false);
const createInitialGoalBinding = ref<TaskPlanViewModel['goalBinding']>(null);
const busyOccurrenceId = ref<string | null>(null);
const scopedGoalName = ref<string | null>(null);
const scopedKeyResultTitle = ref<string | null>(null);
const occurrencePlanDetails = ref<TaskPlanClientDTO[]>([]);

const queryGoalId = computed(() =>
  typeof route.query.goalId === 'string' && route.query.goalId.length > 0
    ? route.query.goalId
    : null,
);
const queryKeyResultId = computed(() =>
  typeof route.query.keyResultId === 'string' && route.query.keyResultId.length > 0
    ? route.query.keyResultId
    : null,
);
const goalScopeLabel = computed(() => {
  if (!queryGoalId.value) return null;
  const goalLabel = scopedGoalName.value ?? t('task.management.scope.goal');
  if (!queryKeyResultId.value) return goalLabel;
  const keyResultLabel = scopedKeyResultTitle.value ?? t('task.management.scope.keyResult');
  return `${goalLabel} · ${keyResultLabel}`;
});
const planStateFilters: Record<TaskPlanStateFilter, TaskPlanListQueryInput> = {
  all: {},
  active: { status: ['Active'], outcome: ['Open'], archiveState: 'active' },
  paused: { status: ['Paused'], outcome: ['Open'], archiveState: 'active' },
  succeeded: { outcome: ['Succeeded'] },
  failed: { outcome: ['Failed'] },
  abandoned: { outcome: ['Abandoned'] },
  archived: { archiveState: 'archived' },
};
watch(
  [planStateFilter, labelFilterIds, queryGoalId, queryKeyResultId],
  () => { planPage.value = 1; },
  { deep: true, flush: 'sync' },
);
const taskListParams = computed(() => ({
  page: planPage.value,
  limit: 100,
  ...planStateFilters[planStateFilter.value],
  ...(labelFilterIds.value.length ? { labelIdsAll: labelFilterIds.value } : {}),
  ...(queryGoalId.value ? { goalId: queryGoalId.value } : {}),
  ...(queryGoalId.value && queryKeyResultId.value ? { keyResultId: queryKeyResultId.value } : {}),
}));
const {
  templates,
  total: planTotal,
  isLoading: templatesLoading,
  isError: templatesError,
  refetch: refetchTemplates,
} = useTaskPlanListQuery({ params: taskListParams, enabled: () => activeSurface.value === 'plans' });
const { createPlanSafe, abandonPlanSafe, deletePlanSafe, isSaving } = useTaskPlanMutations();
const {
  fetchInstancesByDateRange: fetchOccurrencesByDateRange,
  completeOccurrence: completeOccurrenceMutation,
  uncompleteOccurrence: uncompleteOccurrenceMutation,
  markOccurrenceMissed: markOccurrenceMissedMutation,
  skipOccurrence: skipOccurrenceMutation,
  setOccurrenceChecklistItem: setOccurrenceChecklistItemMutation,
} = useTaskOccurrences();
const taskStore = useTaskStore();
const { instances, isLoading: instancesLoading, error: instancesError } = storeToRefs(taskStore);

const templateById = computed(
  () =>
    new Map(
      [...occurrencePlanDetails.value, ...templates.value].map((template) => [
        String(template.id),
        template,
      ]),
    ),
);
const planViewModels = computed(() =>
  templates.value.map((template) => mapTaskPlanDtoToViewModel(template, t)),
);
const availableLabels = computed(() => {
  const byId = new Map(
    [...templateById.value.values()]
      .flatMap((template) => template.labels)
      .map((label) => [label.id, label] as const),
  );
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
});
const isLoading = computed(
  () =>
    activeSurface.value === 'plans'
      ? templatesLoading.value
      : instancesLoading.value || todayDetailsLoading.value,
);
const loadError = computed(
  () =>
    activeSurface.value === 'plans'
      ? templatesError.value
      : Boolean(instancesError.value) || todayDetailsError.value,
);

function templateMatchesFilters(templateId: string): boolean {
  const template = templateById.value.get(templateId);
  if (!template) return false;
  if (queryGoalId.value && template.goalBinding?.goalId !== queryGoalId.value) return false;
  if (queryKeyResultId.value && template.goalBinding?.keyResultId !== queryKeyResultId.value)
    return false;
  if (
    labelFilterIds.value.length > 0 &&
    !labelFilterIds.value.every((labelId) => template.labels.some((label) => label.id === labelId))
  )
    return false;
  return true;
}

const todayOccurrences = computed(() =>
  instances.value.filter((occurrence) => isTaskOccurrenceOnTodaySurface(occurrence)),
);
const visibleOccurrences = computed(() =>
  sortTaskOccurrences(
    todayOccurrences.value.filter(
      (occurrence) =>
        templateMatchesFilters(String(occurrence.planId)) &&
        (occurrenceStatusFilter.value === 'all' ||
          occurrence.status === occurrenceStatusFilter.value),
    ),
    occurrenceSort.value,
    (templateId) => templateById.value.get(templateId)?.name ?? '',
  ),
);
const occurrenceGroups = computed(() =>
  [
    {
      key: 'overdue' as const,
      label: t('task.management.group.overdue'),
      occurrences: visibleOccurrences.value.filter(
        (occurrence) => !isTodayMs(occurrence.dueAt) && isTaskOccurrenceOverdue(occurrence),
      ),
    },
    {
      key: 'today' as const,
      label: t('task.management.group.today'),
      occurrences: visibleOccurrences.value.filter((occurrence) => isTodayMs(occurrence.dueAt)),
    },
  ].filter((group) => group.occurrences.length > 0),
);
function matchesPlanState(template: TaskPlanViewModel): boolean {
  switch (planStateFilter.value) {
    case 'all':
      return true;
    case 'active':
      return !template.isArchived && template.outcome === 'Open' && Boolean(template.isActive);
    case 'paused':
      return !template.isArchived && template.outcome === 'Open' && Boolean(template.isPaused);
    case 'succeeded':
      return template.outcome === 'Succeeded';
    case 'failed':
      return template.outcome === 'Failed';
    case 'abandoned':
      return template.outcome === 'Abandoned';
    case 'archived':
      return Boolean(template.isArchived);
  }
}

const filteredPlans = computed(() =>
  planViewModels.value.filter(
    (template) => templateMatchesFilters(String(template.id)) && matchesPlanState(template),
  ),
);
const visibleItemCount = computed(() =>
  activeSurface.value === 'plans' ? filteredPlans.value.length : visibleOccurrences.value.length,
);

async function loadTodayOccurrences(force = false) {
  const request = ++todayRequest;
  const identityScope = resolveIdentityScope();
  todayDetailsLoading.value = true;
  todayDetailsError.value = false;
  try {
    const now = Date.now();
    const occurrences = await fetchOccurrencesByDateRange(startOfDayMs(now), endOfDayMs(now), {
      force,
      includeOverdueOpen: true,
    });
    if (request !== todayRequest || identityScope !== resolveIdentityScope()) return;
    const missingPlanIds = [...new Set(occurrences.map((occurrence) => String(occurrence.planId)))];
    // Read each referenced plan through its canonical identity-scoped detail key.
    const details = await Promise.all(
      missingPlanIds.map((planId) =>
        runtime.queryClient.fetchQuery({
          queryKey: taskPlanQueryKeys.detail(identityScope, planId),
          staleTime: force ? 0 : TASK_TEMPLATE_STALE_TIME_MS,
          queryFn: async () => unwrap(await taskService.getPlan(planId)).toDTO(),
        }),
      ),
    );
    if (request !== todayRequest || identityScope !== resolveIdentityScope()) return;
    occurrencePlanDetails.value = details;
  } catch {
    if (request === todayRequest && identityScope === resolveIdentityScope())
      todayDetailsError.value = true;
  } finally {
    if (request === todayRequest && identityScope === resolveIdentityScope())
      todayDetailsLoading.value = false;
  }
}

async function reloadSurface() {
  if (activeSurface.value === 'plans') await refetchTemplates();
  else await loadTodayOccurrences(true);
}

async function resolveGoalScopeLabel() {
  const identityScope = resolveIdentityScope();
  const goalId = queryGoalId.value;
  const keyResultId = queryKeyResultId.value;
  scopedGoalName.value = null;
  scopedKeyResultTitle.value = null;
  if (!goalId) return;

  const [goalResult, keyResultsResult] = await Promise.all([
    goalService.getGoal(goalId).catch(() => null),
    keyResultId ? goalService.getKeyResults(goalId).catch(() => null) : Promise.resolve(null),
  ]);
  if (
    identityScope !== resolveIdentityScope() ||
    goalId !== queryGoalId.value ||
    keyResultId !== queryKeyResultId.value
  )
    return;

  if (goalResult?.ok) scopedGoalName.value = goalResult.data.name;
  if (keyResultId && keyResultsResult?.ok) {
    scopedKeyResultTitle.value =
      keyResultsResult.data.keyResults.find((keyResult) => String(keyResult.id) === keyResultId)
        ?.title ?? null;
  }
}

function openCreateDialog() {
  createInitialGoalBinding.value = null;
  showDialog.value = true;
}

function openBoundTaskCreateDialog(goalId: string, keyResultId?: string | null) {
  createInitialGoalBinding.value = {
    goalId,
    keyResultId: keyResultId || null,
  };
  showDialog.value = true;
}
function openTaskDetail(id: string) {
  void router.push({ name: 'task-detail', params: { id } });
}

function openSchedule() {
  void router.push({ name: 'ScheduleCalendar' });
}

function clearGoalScope() {
  void router.replace({ name: 'task-list' });
}

function closeDialog() {
  showDialog.value = false;
  createInitialGoalBinding.value = null;
}

function goalBinding(vm: TaskPlanViewModel) {
  if (!vm.goalBinding?.goalId) return null;
  return {
    goalId: vm.goalBinding.goalId as GoalId,
    keyResultId: vm.goalBinding.keyResultId ? (vm.goalBinding.keyResultId as KeyResultId) : null,
    contribution: vm.goalBinding.keyResultId ? (vm.goalBinding.contribution ?? null) : null,
  };
}

async function handleSubmit(vm: TaskPlanViewModel) {
  const common = {
    name: vm.title,
    description: vm.description ?? null,
    schedule: toTaskPlanSchedulePayload(vm),
    reminderConfig: (vm.reminderConfig as never) ?? null,
    importance: (vm.importance as ImportanceLevel) ?? ImportanceLevel.Moderate,
    labelIds: vm.labelIds ?? vm.labels?.map((label) => label.id) ?? [],
    goalBinding: goalBinding(vm),
    checklist: vm.checklist,
  };
  const saved = await createPlanSafe(common);
  if (saved) {
    closeDialog();
    await reloadSurface();
  }
}
async function abandon(id: string) {
  if (await abandonPlanSafe(id)) await refetchTemplates();
}
async function remove(vm: TaskPlanViewModel) {
  const confirmed = await useConfirm({
    title: t('task.management.deletePlan'),
    description: t('task.management.confirmDelete', { name: vm.title }),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  if (await deletePlanSafe(vm.id)) await reloadSurface();
}
async function runOccurrenceAction(id: string, action: (id: string) => Promise<unknown>) {
  busyOccurrenceId.value = id;
  try {
    await action(id);
  } finally {
    busyOccurrenceId.value = null;
  }
}
const completeOccurrence = (id: string) => runOccurrenceAction(id, completeOccurrenceMutation);
const uncompleteOccurrence = (id: string) => runOccurrenceAction(id, uncompleteOccurrenceMutation);
const markOccurrenceMissed = (id: string) => runOccurrenceAction(id, markOccurrenceMissedMutation);
const skipOccurrence = (id: string) => runOccurrenceAction(id, skipOccurrenceMutation);
const setOccurrenceChecklistItem = (
  occurrenceId: string,
  definitionId: string,
  completed: boolean,
  expectedVersion: number,
) =>
  runOccurrenceAction(occurrenceId, (id) =>
    setOccurrenceChecklistItemMutation(id, { definitionId, completed, expectedVersion }),
  );

watch(
  [queryGoalId, queryKeyResultId],
  ([goalId]) => {
    if (goalId) activeSurface.value = 'plans';
    void resolveGoalScopeLabel();
  },
  { immediate: true },
);

watch(resolveIdentityScope, () => {
  planPage.value = 1;
  ++todayRequest;
  occurrencePlanDetails.value = [];
  todayDetailsLoading.value = false;
  todayDetailsError.value = false;
  void resolveGoalScopeLabel();
  if (activeSurface.value === 'today') void loadTodayOccurrences();
});

watch(activeSurface, (surface) => {
  if (surface === 'today') void loadTodayOccurrences();
});

watch(
  () => [route.query.create, route.query.createGoalId, route.query.createKeyResultId] as const,
  ([create, createGoalId, createKeyResultId]) => {
    if (create !== '1' || typeof createGoalId !== 'string' || createGoalId.length === 0) return;
    openBoundTaskCreateDialog(
      createGoalId,
      typeof createKeyResultId === 'string' ? createKeyResultId : null,
    );
    void router.replace({ name: 'task-list' });
  },
  { immediate: true },
);

onMounted(() => {
  if (activeSurface.value === 'today') void loadTodayOccurrences();
});
</script>
