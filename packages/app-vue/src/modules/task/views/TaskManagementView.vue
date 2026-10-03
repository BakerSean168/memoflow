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
              <div
                class="flex items-center gap-2 border-b border-[hsl(var(--border-subtle))] px-1 pb-2"
              >
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
                  :inspect="true"
                  @inspect="openOccurrenceInspect"
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

          <div
            class="mt-4 flex items-center justify-between gap-3 border-t border-[hsl(var(--border-subtle))] pt-3"
          >
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

    <TaskOccurrenceInspectDialog
      v-if="selectedOccurrence"
      :model-value="true"
      :occurrence="selectedOccurrence"
      :plan-name="selectedPlanName"
      :busy="busyOccurrenceId === String(selectedOccurrence.id)"
      @update:model-value="!$event && (selectedOccurrence = null)"
      @view-plan="openTaskDetail"
      @complete="updateInspectedOccurrence(completeOccurrence($event))"
      @uncomplete="updateInspectedOccurrence(uncompleteOccurrence($event))"
      @missed="updateInspectedOccurrence(markOccurrenceMissed($event))"
      @skip="updateInspectedOccurrence(skipOccurrence($event))"
      @checklist-change="
        (id, definitionId, completed, version) =>
          updateInspectedOccurrence(
            setOccurrenceChecklistItem(id, definitionId, completed, version),
          )
      "
    />

    <QuickTaskDialog
      v-model="showQuickTaskDialog"
      :saving="isSaving"
      @save="handleQuickSubmit"
      @cancel="closeQuickTaskDialog"
    />

    <TaskPlanDialog
      v-model="showDialog"
      mode="create"
      :template="null"
      :saving="isSaving"
      :initial-goal-binding="createInitialGoalBinding"
      :submit-owner="handleSubmit"
      @save="handleSubmit"
      @dirty-change="fullCreateDirty = $event"
      @busy-change="fullCreateBusy = $event"
      @session-change="handleSessionChange"
      @cancel="closeDialog"
    />
    <TaskCompletionMeasurementDialog
      :coordinator="actionCoordinator"
      @completed="applyMeasuredCompletion"
    />
  </div>
</template>

<script setup lang="ts">
import { buildTaskPlanCreateRequest } from '../utils/task-plan-create-request';

import { computed, onMounted, onActivated, onDeactivated, onBeforeUnmount, ref, watch } from 'vue';
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
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import TaskOccurrenceInspectDialog from '../components/dialogs/TaskOccurrenceInspectDialog.vue';
import TaskOccurrenceRow from '../components/TaskOccurrenceRow.vue';
import TaskPageToolbar from '../components/TaskPageToolbar.vue';
import TaskPlanRow from '../components/TaskPlanRow.vue';
import TaskPlanDialog from '../components/dialogs/TaskPlanDialog.vue';
import QuickTaskDialog from '../components/dialogs/QuickTaskDialog.vue';
import { buildQuickTaskRequest } from '../utils/quick-task-request';
import type { TaskPlanStateFilter, TaskPlanViewModel, TaskSurface } from '../components/types';
import { useTaskStore } from '../stores/task-store';
import { useTaskToday } from '../composables/useTaskToday';
import TaskCompletionMeasurementDialog from '../components/dialogs/TaskCompletionMeasurementDialog.vue';
import { useTaskOccurrenceActionCoordinator } from '../composables/useTaskOccurrenceActionCoordinator';
import { useTaskPlanListQuery } from '../composables/useTaskPlanListQuery';
import { useTaskNativeSurfaceRegistration } from '../../../layouts/shell/useTaskNativeSurface';
import { usePanelSurfaceStatus } from '../../../layouts/shell/usePanelSurfaceStatus';
import type {
  TaskNativeEditSession,
  TaskNativeSubmitContext,
} from '../composables/taskNativeEditSession';
import { useTaskPlanMutations } from '../composables/useTaskPlanMutations';
import { mapTaskPlanDtoToViewModel } from '../utils/task-plan-presentation';
import {
  isTaskOccurrenceOnTodaySurface,
  isTaskOccurrenceOverdue,
  sortTaskOccurrences,
  type TaskOccurrenceSort,
} from '../utils/task-occurrence-presentation';
import { isTodayMs } from '../../../shared/utils/product-time';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { type TaskPlanListQueryInput } from '../../../platform/server-state/query-keys';
import { useServerStateIdentityScope } from '../../../platform/server-state';
import { useStrictInject } from '../../../shared/utils/useStrictInject';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const nativeSurface = useTaskNativeSurfaceRegistration();
let unregisterSession: (() => void) | null = null;
let surfaceActive = true;
function handleSessionChange(session: TaskNativeEditSession | null) {
  unregisterSession?.();
  unregisterSession =
    session && surfaceActive ? (nativeSurface?.register(route.fullPath, session) ?? null) : null;
}
onActivated(() => {
  surfaceActive = true;
});
onDeactivated(() => {
  surfaceActive = false;
  handleSessionChange(null);
});
onBeforeUnmount(() => {
  surfaceActive = false;
  handleSessionChange(null);
});
const fullCreateDirty = ref(false);
const fullCreateBusy = ref(false);

const goalService = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');

const resolveIdentityScope = useServerStateIdentityScope();
const planPage = ref(1);

const activeSurface = ref<TaskSurface>('today');
const occurrenceStatusFilter = ref<'all' | TaskOccurrenceClientDTO['status']>('all');
const planStateFilter = ref<TaskPlanStateFilter>('all');
const labelFilterIds = ref<string[]>([]);
const occurrenceSort = ref<TaskOccurrenceSort>('time');
const showDialog = ref(false);
const showQuickTaskDialog = ref(false);
const createInitialGoalBinding = ref<TaskPlanViewModel['goalBinding']>(null);
const scopedGoalName = ref<string | null>(null);
const scopedKeyResultTitle = ref<string | null>(null);

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
  () => {
    planPage.value = 1;
  },
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
} = useTaskPlanListQuery({
  params: taskListParams,
  enabled: () => activeSurface.value === 'plans',
});
const { createPlanSafe, abandonPlanSafe, deletePlanSafe, isSaving } = useTaskPlanMutations();
usePanelSurfaceStatus(
  computed(() =>
    fullCreateBusy.value || isSaving.value ? 'busy' : fullCreateDirty.value ? 'dirty' : 'clean',
  ),
);
const {
  operations: occurrenceOperations,
  templates: occurrencePlanDetails,
  detailsLoading: todayDetailsLoading,
  detailsError: todayDetailsError,
  load: loadTodayOccurrences,
} = useTaskToday();
const actionCoordinator = useTaskOccurrenceActionCoordinator({
  operations: occurrenceOperations,
  resolveGoalBinding: (id) => {
    const occurrence =
      instances.value.find((item) => String(item.id) === id) ??
      (String(selectedOccurrence.value?.id) === id ? selectedOccurrence.value : null);
    return occurrence ? templateById.value.get(String(occurrence.planId))?.goalBinding : null;
  },
});
const {
  busyOccurrenceId,
  requestComplete: completeOccurrence,
  requestUncomplete: uncompleteOccurrence,
  requestMissed: markOccurrenceMissed,
  requestSkip: skipOccurrence,
  requestChecklistChange: setOccurrenceChecklistItem,
} = actionCoordinator;
const taskStore = useTaskStore();
const { instances, isLoading: instancesLoading, error: instancesError } = storeToRefs(taskStore);

const selectedOccurrence = ref<TaskOccurrenceClientDTO | null>(null);
const selectedPlanName = ref('');
async function updateInspectedOccurrence(action: Promise<TaskOccurrenceClientDTO | null>) {
  const identityScope = resolveIdentityScope();
  const updated = await action;
  // A corrected overdue occurrence can leave the bounded Today read while Inspect stays open.
  if (identityScope === resolveIdentityScope() && updated?.id === selectedOccurrence.value?.id) {
    selectedOccurrence.value = updated;
  }
}

function applyMeasuredCompletion(occurrence: TaskOccurrenceClientDTO) {
  if (occurrence.id === selectedOccurrence.value?.id) selectedOccurrence.value = occurrence;
}

function openOccurrenceInspect(id: string) {
  const occurrence = instances.value.find((item) => String(item.id) === id);
  if (!occurrence) return;
  selectedOccurrence.value = occurrence;
  selectedPlanName.value = templateById.value.get(String(occurrence.planId))?.name ?? '';
}
watch(
  () => instances.value.find((item) => item.id === selectedOccurrence.value?.id),
  (occurrence) => {
    if (occurrence) selectedOccurrence.value = occurrence;
  },
  { flush: 'sync' },
);

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
const isLoading = computed(() =>
  activeSurface.value === 'plans'
    ? templatesLoading.value
    : instancesLoading.value || todayDetailsLoading.value,
);
const loadError = computed(() =>
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
  selectedOccurrence.value = null;
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
  if (route.query.dialog === 'task-plan') {
    const query = { ...route.query };
    delete query.dialog;
    void router.replace({ query, hash: route.hash });
  }
}

function closeQuickTaskDialog() {
  showQuickTaskDialog.value = false;
  if (route.query.dialog !== 'quick-task') return;
  const query = { ...route.query };
  delete query.dialog;
  void router.replace({ query, hash: route.hash });
}

async function handleQuickSubmit({ title }: { title: string }) {
  const saved = await createPlanSafe(buildQuickTaskRequest(title), 'quick');
  if (!saved) return;
  closeQuickTaskDialog();
  await loadTodayOccurrences(true);
}

async function handleSubmit(vm: TaskPlanViewModel, context?: TaskNativeSubmitContext) {
  const common = buildTaskPlanCreateRequest(vm, context?.createId);
  context?.onCreateAttempt();
  const saved = await createPlanSafe(common);
  if (saved) {
    closeDialog();
    await reloadSurface();
  }
  return saved?.plan.toDTO() ?? null;
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

watch(
  [queryGoalId, queryKeyResultId],
  ([goalId]) => {
    if (goalId) activeSurface.value = 'plans';
    void resolveGoalScopeLabel();
  },
  { immediate: true },
);

watch(resolveIdentityScope, () => {
  selectedOccurrence.value = null;
  planPage.value = 1;
  void resolveGoalScopeLabel();
  if (activeSurface.value === 'today') void loadTodayOccurrences();
});

watch(activeSurface, (surface) => {
  if (surface === 'today') void loadTodayOccurrences();
});

watch(
  () => route.query.dialog,
  (dialog) => {
    showQuickTaskDialog.value = dialog === 'quick-task';
    showDialog.value = dialog === 'task-plan';
  },
  { immediate: true },
);

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
