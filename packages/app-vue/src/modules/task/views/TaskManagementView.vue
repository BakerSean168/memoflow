<template>
  <div
    class="task-management-view flex h-full min-h-0 flex-col bg-background"
    data-testid="task-management-view"
  >
    <ModuleHeader data-testid="task-page-toolbar">
      <template #leading>
        <div class="min-w-0">
          <h1 class="truncate text-sm font-semibold">{{ t('task.management.title') }}</h1>
          <p class="hidden truncate text-xs text-muted-foreground @2xl/panel:block">
            {{ t('task.management.subtitle') }}
          </p>
        </div>
      </template>
      <template #actions>
        <Button
          data-testid="create-task-plan-button"
          data-primary-action="create-task"
          @click="openCreateDialog"
        >
          <Plus class="mr-2 h-4 w-4" />
          {{ t('task.action.create') }}
        </Button>
      </template>

      <template #subnav>
        <div
          class="flex min-w-0 flex-1 flex-wrap items-center gap-2"
          data-testid="task-surface-tabs"
        >
          <Button
            v-for="surface in surfaces"
            :key="surface"
            size="sm"
            :variant="activeSurface === surface ? 'default' : 'ghost'"
            :data-testid="`task-surface-${surface}`"
            @click="activeSurface = surface"
          >
            {{ t(`task.management.surface.${surface}`) }}
            <Badge v-if="surface !== 'plans'" variant="secondary" class="ml-2">
              {{ surfaceCounts[surface] }}
            </Badge>
          </Button>
        </div>
      </template>
    </ModuleHeader>

    <main
      class="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 @md/panel:px-5 @md/panel:py-4"
      data-scroll-host="task-management"
      data-testid="task-management-scroll-host"
    >
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <section
          class="grid gap-2 rounded-xl border bg-card p-3 @2xl/panel:grid-cols-[minmax(0,1fr)_repeat(3,minmax(9rem,auto))]"
          data-testid="task-filter-bar"
        >
          <label class="relative block min-w-0">
            <Search
              class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              v-model="searchQuery"
              :placeholder="t('task.management.searchPlaceholder')"
              class="pl-9"
              data-testid="task-search-input"
            />
          </label>

          <select
            v-model="statusFilter"
            class="h-9 rounded-md border bg-background px-3 text-sm"
            data-testid="task-status-filter"
            :aria-label="t('task.management.filter.status')"
          >
            <option value="all">{{ t('task.management.filter.allStatuses') }}</option>
            <option v-for="status in instanceStatuses" :key="status" :value="status">
              {{ t(`task.occurrence.status.${status.toLowerCase()}`) }}
            </option>
          </select>

          <select
            v-model="labelFilter"
            class="h-9 rounded-md border bg-background px-3 text-sm"
            data-testid="task-label-filter"
            :aria-label="t('task.management.filter.label')"
          >
            <option value="all">{{ t('task.management.filter.allLabels') }}</option>
            <option v-for="label in availableLabels" :key="label.id" :value="label.id">
              {{ label.name }}
            </option>
          </select>

          <select
            v-model="goalFilter"
            class="h-9 rounded-md border bg-background px-3 text-sm"
            data-testid="task-goal-filter"
            :aria-label="t('task.management.filter.goal')"
          >
            <option value="all">{{ t('task.management.filter.allGoals') }}</option>
            <option value="linked">{{ t('task.management.filter.goalLinked') }}</option>
            <option value="unlinked">{{ t('task.management.filter.goalUnlinked') }}</option>
          </select>
        </section>

        <div
          v-if="activeSurface !== 'plans'"
          class="flex items-center justify-between gap-3 text-xs text-muted-foreground"
        >
          <p>
            {{
              activeSurface === 'today'
                ? t('task.management.todayExplanation')
                : t('task.management.upcomingExplanation')
            }}
          </p>
          <select
            v-model="occurrenceSort"
            class="h-8 rounded-md border bg-background px-2"
            data-testid="task-occurrence-sort"
            :aria-label="t('task.management.filter.sort')"
          >
            <option value="time">{{ t('task.management.sort.time') }}</option>
            <option value="status">{{ t('task.management.sort.status') }}</option>
            <option value="title">{{ t('task.management.sort.title') }}</option>
          </select>
        </div>

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
          <div
            v-if="filteredPlans.length"
            class="grid gap-3 @2xl/panel:grid-cols-2"
            data-testid="task-plan-list"
          >
            <article
              v-for="template in filteredPlans"
              :key="template.id"
              class="rounded-xl border bg-card p-4 shadow-sm"
              data-testid="task-plan-card"
              :data-task-id="template.id"
            >
              <button
                type="button"
                class="w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                @click="openTaskDetail(template.id)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h2 class="truncate font-semibold">{{ template.title }}</h2>
                    <p
                      v-if="template.description"
                      class="mt-1 line-clamp-2 text-sm text-muted-foreground"
                    >
                      {{ template.description }}
                    </p>
                  </div>
                  <Badge variant="secondary">{{ template.statusText }}</Badge>
                </div>
                <div class="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{{ template.importanceText }}</span>
                  <span aria-hidden="true">·</span>
                  <span>{{ template.recurrenceText }}</span>
                  <template v-if="template.goalBinding">
                    <span aria-hidden="true">·</span>
                    <span>{{ t('task.occurrence.goalLinked') }}</span>
                  </template>
                </div>
              </button>
              <div class="mt-4 flex flex-wrap justify-end gap-1 border-t pt-3">
                <Button variant="ghost" size="sm" @click="openEditDialog(template)">
                  {{ t('common.edit') }}
                </Button>
                <Button variant="ghost" size="sm" @click="archive(template.id)">
                  {{ t('task.action.archive') }}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="text-destructive"
                  @click="remove(template)"
                >
                  {{ t('common.delete') }}
                </Button>
              </div>
            </article>
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
            class="grid gap-3"
            data-testid="task-occurrence-list"
          >
            <TaskOccurrenceRow
              v-for="occurrence in visibleOccurrences"
              :key="occurrence.id"
              :occurrence="occurrence"
              :template="templateById.get(String(occurrence.templateId))!"
              :position="occurrencePositions.get(String(occurrence.id))"
              :busy="busyOccurrenceId === String(occurrence.id)"
              @open-plan="openTaskDetail"
              @complete="completeOccurrence"
              @uncomplete="uncompleteOccurrence"
              @missed="markOccurrenceMissed"
              @skip="skipOccurrence"
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
      :mode="dialogMode"
      :template="selectedTemplate"
      :saving="isSaving"
      @save="handleSubmit"
      @cancel="closeDialog"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Badge, Button, Input, useConfirm } from '@memoflow/ui-vue-shadcn';
import {
  CalendarCheck2,
  CircleAlert,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from '@lucide/vue';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import type { GoalId, KeyResultId } from '@memoflow/contracts/primitives';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import ModuleHeader from '../../../components/shared/ModuleHeader.vue';
import TaskOccurrenceRow from '../components/TaskOccurrenceRow.vue';
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

const router = useRouter();
const { t } = useI18n();
const surfaces = ['today', 'upcoming', 'plans'] as const;
const instanceStatuses: TaskOccurrenceClientDTO['status'][] = [
  'Pending',
  'InProgress',
  'Completed',
  'Missed',
  'Skipped',
];

const activeSurface = ref<(typeof surfaces)[number]>('today');
const searchQuery = ref('');
const statusFilter = ref<'all' | TaskOccurrenceClientDTO['status']>('all');
const labelFilter = ref('all');
const goalFilter = ref<'all' | 'linked' | 'unlinked'>('all');
const occurrenceSort = ref<TaskOccurrenceSort>('time');
const showDialog = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const selectedTemplate = ref<TaskPlanViewModel | null>(null);
const busyOccurrenceId = ref<string | null>(null);

const {
  templates,
  isLoading: templatesLoading,
  isError: templatesError,
  refetch: refetchTemplates,
} = useTaskPlanListQuery({ page: 1, limit: 500 });
const {
  createTemplateSafe,
  updateTemplateSafe,
  archiveTemplateSafe,
  deleteTemplateSafe,
  isSaving,
} = useTaskPlanMutations();
const { fetchInstances, completeInstance, uncompleteInstance, markInstanceMissed, skipInstance } =
  useTaskOccurrences();
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
  const query = searchQuery.value.trim().toLowerCase();
  if (
    query &&
    ![template.name, template.description ?? '', ...template.labels.map((label) => label.name)]
      .join(' ')
      .toLowerCase()
      .includes(query)
  ) {
    return false;
  }
  if (
    labelFilter.value !== 'all' &&
    !template.labels.some((label) => label.id === labelFilter.value)
  )
    return false;
  if (goalFilter.value === 'linked' && !template.goalBinding) return false;
  if (goalFilter.value === 'unlinked' && template.goalBinding) return false;
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
        templateMatchesFilters(String(occurrence.templateId)) &&
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
          templateById.value.get(String(occurrence.templateId)),
        ),
      ]),
    ),
);
const surfaceCounts = computed(() => ({
  today: instances.value.filter((occurrence) => isTaskOccurrenceOnSurface(occurrence, 'today'))
    .length,
  upcoming: instances.value.filter((occurrence) =>
    isTaskOccurrenceOnSurface(occurrence, 'upcoming'),
  ).length,
}));
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

async function reloadSurface() {
  await Promise.all([refetchTemplates(), fetchInstances({ page: 1, limit: 500 })]);
}

function openCreateDialog() {
  dialogMode.value = 'create';
  selectedTemplate.value = null;
  showDialog.value = true;
}
function openEditDialog(template: TaskPlanViewModel) {
  dialogMode.value = 'edit';
  selectedTemplate.value = template;
  showDialog.value = true;
}
function openTaskDetail(id: string) {
  void router.push({ name: 'task-detail', params: { id } });
}

function closeDialog() {
  showDialog.value = false;
  selectedTemplate.value = null;
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
  };
  const saved =
    dialogMode.value === 'edit' && vm.id
      ? await updateTemplateSafe(vm.id, common)
      : await createTemplateSafe(common);
  if (saved) {
    closeDialog();
    await reloadSurface();
  }
}
async function archive(id: string) {
  if (await archiveTemplateSafe(id)) await refetchTemplates();
}
async function remove(vm: TaskPlanViewModel) {
  const confirmed = await useConfirm({
    title: t('task.management.deleteTemplate'),
    description: t('task.management.confirmDelete', { name: vm.title }),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  if (await deleteTemplateSafe(vm.id)) await reloadSurface();
}
async function runOccurrenceAction(id: string, action: (id: string) => Promise<unknown>) {
  busyOccurrenceId.value = id;
  try {
    await action(id);
  } finally {
    busyOccurrenceId.value = null;
  }
}
const completeOccurrence = (id: string) => runOccurrenceAction(id, completeInstance);
const uncompleteOccurrence = (id: string) => runOccurrenceAction(id, uncompleteInstance);
const markOccurrenceMissed = (id: string) => runOccurrenceAction(id, markInstanceMissed);
const skipOccurrence = (id: string) => runOccurrenceAction(id, skipInstance);

onMounted(() => {
  void fetchInstances({ page: 1, limit: 500 });
});
</script>
