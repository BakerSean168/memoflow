<template>
  <div
    class="task-management-view flex h-full min-h-0 flex-col bg-background"
    data-testid="task-management-view"
  >
    <TaskPageToolbar
      :active-surface="activeSurface"
      :visible-item-count="visibleItemCount"
      :status-filter="statusFilter"
      :label-filter-ids="labelFilterIds"
      :label-options="availableLabels"
      :occurrence-sort="occurrenceSort"
      :goal-scope-label="goalScopeLabel"
      @update:active-surface="activeSurface = $event"
      @update:status-filter="statusFilter = $event"
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
        </template>

        <template v-else>
          <div
            v-if="visibleOccurrences.length"
            class="border-y border-[hsl(var(--border-subtle))]"
            data-testid="task-occurrence-list"
          >
            <TaskOccurrenceRow
              v-for="occurrence in visibleOccurrences"
              :key="occurrence.id"
              :occurrence="occurrence"
              :template="templateById.get(String(occurrence.planId))!"
              :position="occurrencePositions.get(String(occurrence.id))"
              :busy="busyOccurrenceId === String(occurrence.id)"
              @open-plan="openTaskDetail"
              @complete="completeOccurrence"
              @uncomplete="uncompleteOccurrence"
              @missed="markOccurrenceMissed"
              @skip="skipOccurrence"
              @checklist-change="setOccurrenceChecklistItem"
            />
          </div>
          <div
            v-else
            class="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center"
            data-testid="task-occurrences-empty-state"
          >
            <CalendarCheck2 class="mb-3 h-8 w-8 text-muted-foreground" />
            <h2 class="font-semibold">
              {{
                activeSurface === 'today'
                  ? t('task.management.emptyToday')
                  : t('task.management.emptyUpcoming')
              }}
            </h2>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ t('task.management.emptyOccurrenceDescription') }}
            </p>
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
import { CalendarCheck2, CircleAlert, ListChecks, Loader2, RefreshCw } from '@lucide/vue';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import type { GoalId, KeyResultId } from '@memoflow/contracts/primitives';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import TaskOccurrenceRow from '../components/TaskOccurrenceRow.vue';
import TaskPageToolbar from '../components/TaskPageToolbar.vue';
import TaskPlanRow from '../components/TaskPlanRow.vue';
import TaskPlanDialog from '../components/dialogs/TaskPlanDialog.vue';
import type { TaskPlanViewModel } from '../components/types';
import { useTaskStore } from '../stores/task-store';
import { useTaskOccurrences } from '../composables/useTaskOccurrences';
import { useTaskPlanListQuery } from '../composables/useTaskPlanListQuery';
import { useTaskPlanMutations } from '../composables/useTaskPlanMutations';
import {
  mapTaskPlanDtoToViewModel,
  toTaskPlanSchedulePayload,
} from '../utils/task-plan-presentation';
import {
  getTaskOccurrencePosition,
  isTaskOccurrenceOnSurface,
  sortTaskOccurrences,
  type TaskOccurrenceSort,
} from '../utils/task-occurrence-presentation';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
type TaskSurface = 'today' | 'upcoming' | 'plans';

const activeSurface = ref<TaskSurface>('today');
const statusFilter = ref<'all' | TaskOccurrenceClientDTO['status']>('all');
const labelFilterIds = ref<string[]>([]);
const occurrenceSort = ref<TaskOccurrenceSort>('time');
const showDialog = ref(false);
const createInitialGoalBinding = ref<TaskPlanViewModel['goalBinding']>(null);
const busyOccurrenceId = ref<string | null>(null);

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
  return queryKeyResultId.value
    ? `Goal ${queryGoalId.value} · KR ${queryKeyResultId.value}`
    : `Goal ${queryGoalId.value}`;
});
const taskListParams = computed(() => ({
  page: 1,
  limit: 500,
  ...(queryGoalId.value ? { goalId: queryGoalId.value } : {}),
}));
const {
  templates,
  isLoading: templatesLoading,
  isError: templatesError,
  refetch: refetchTemplates,
} = useTaskPlanListQuery(taskListParams);
const { createPlanSafe, abandonPlanSafe, deletePlanSafe, isSaving } = useTaskPlanMutations();
const {
  fetchInstances: fetchOccurrencesMutation,
  completeOccurrence: completeOccurrenceMutation,
  uncompleteOccurrence: uncompleteOccurrenceMutation,
  markOccurrenceMissed: markOccurrenceMissedMutation,
  skipOccurrence: skipOccurrenceMutation,
  setOccurrenceChecklistItem: setOccurrenceChecklistItemMutation,
} = useTaskOccurrences();
const taskStore = useTaskStore();
const { instances, isLoading: instancesLoading, error: instancesError } = storeToRefs(taskStore);

const templateById = computed(
  () => new Map(templates.value.map((template) => [String(template.id), template])),
);
const planViewModels = computed(() =>
  templates.value.map((template) => mapTaskPlanDtoToViewModel(template, t)),
);
const availableLabels = computed(() => {
  const byId = new Map(
    templates.value
      .flatMap((template) => template.labels)
      .map((label) => [label.id, label] as const),
  );
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
});
const isLoading = computed(() => templatesLoading.value || instancesLoading.value);
const loadError = computed(() => templatesError.value || Boolean(instancesError.value));

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

const surfaceOccurrences = computed(() =>
  instances.value.filter((occurrence) =>
    isTaskOccurrenceOnSurface(
      occurrence,
      activeSurface.value === 'upcoming' ? 'upcoming' : 'today',
    ),
  ),
);
const visibleOccurrences = computed(() =>
  sortTaskOccurrences(
    surfaceOccurrences.value.filter(
      (occurrence) =>
        templateMatchesFilters(String(occurrence.planId)) &&
        (statusFilter.value === 'all' || occurrence.status === statusFilter.value),
    ),
    occurrenceSort.value,
    (templateId) => templateById.value.get(templateId)?.name ?? '',
  ),
);
const occurrencePositions = computed(
  () =>
    new Map(
      instances.value.map((occurrence) => [
        String(occurrence.id),
        getTaskOccurrencePosition(
          occurrence,
          instances.value,
          templateById.value.get(String(occurrence.planId)),
        ),
      ]),
    ),
);
const filteredPlans = computed(() =>
  planViewModels.value.filter((template) => {
    if (!templateMatchesFilters(String(template.id))) return false;
    if (statusFilter.value === 'all') return true;
    if (statusFilter.value === 'Completed') return template.status === 'Closed';
    if (statusFilter.value === 'Pending' || statusFilter.value === 'InProgress') {
      return template.status === 'Active';
    }
    return false;
  }),
);
const visibleItemCount = computed(() =>
  activeSurface.value === 'plans' ? filteredPlans.value.length : visibleOccurrences.value.length,
);

async function reloadSurface() {
  await Promise.all([refetchTemplates(), fetchOccurrencesMutation({ page: 1, limit: 500 })]);
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
  void fetchOccurrencesMutation({ page: 1, limit: 500 });
});
</script>
