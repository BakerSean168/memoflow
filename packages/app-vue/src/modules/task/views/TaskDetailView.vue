<template>
  <section
    class="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    data-testid="task-plan-workspace"
  >
    <ModuleHeader data-testid="task-detail-toolbar">
      <template #leading>
        <Button
          variant="ghost"
          size="sm"
          :aria-label="t('common.back')"
          @click="router.push({ name: 'task-list' })"
        >
          <ArrowLeft class="mr-1 h-4 w-4" />
          {{ t('common.back') }}
        </Button>
        <div class="min-w-0">
          <h1 class="truncate text-sm font-semibold">
            {{ viewModel?.title ?? t('task.detail.title') }}
          </h1>
          <p class="hidden truncate text-xs text-muted-foreground @2xl/panel:block">
            {{ t('task.detail.subtitle') }}
          </p>
        </div>
      </template>
      <template #actions>
        <template v-if="viewModel">
          <Button variant="outline" size="sm" @click="openEdit">
            <Pencil class="mr-1.5 h-4 w-4" />
            {{ t('common.edit') }}
          </Button>
          <Button v-if="viewModel.isActive" variant="ghost" size="sm" @click="pause">
            <Pause class="mr-1.5 h-4 w-4" />
            {{ t('task.action.pause') }}
          </Button>
          <Button v-else-if="!viewModel.isArchived" variant="ghost" size="sm" @click="activate">
            <Play class="mr-1.5 h-4 w-4" />
            {{ t('task.action.activate') }}
          </Button>
          <Button variant="ghost" size="sm" @click="archive">
            <Archive class="mr-1.5 h-4 w-4" />
            {{ t('task.action.archive') }}
          </Button>
          <Button variant="ghost" size="sm" class="text-destructive" @click="remove">
            <Trash2 class="mr-1.5 h-4 w-4" />
            {{ t('common.delete') }}
          </Button>
        </template>
      </template>
    </ModuleHeader>

    <main
      class="min-h-0 flex-1 overflow-y-auto px-3 py-3 @md/panel:px-5 @md/panel:py-4"
      data-scroll-host="task-detail"
      data-testid="task-detail-scroll-host"
    >
      <div
        v-if="isLoading"
        class="flex min-h-72 items-center justify-center text-sm text-muted-foreground"
        data-testid="task-detail-loading"
      >
        <Loader2 class="mr-2 h-5 w-5 animate-spin" />
        {{ t('task.detail.loading') }}
      </div>

      <div
        v-else-if="loadError"
        class="mx-auto flex min-h-72 max-w-4xl flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 text-center"
        data-testid="task-detail-error"
      >
        <CircleAlert class="mb-3 h-7 w-7 text-destructive" />
        <h2 class="font-semibold">{{ t('task.error.loadFailedTitle') }}</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ t('task.error.loadFailedDescription') }}
        </p>
        <Button class="mt-4" size="sm" variant="outline" @click="reloadDetail">
          <RefreshCw class="mr-2 h-4 w-4" />
          {{ t('task.action.retry') }}
        </Button>
      </div>

      <div
        v-else-if="viewModel && currentTemplate"
        class="mx-auto flex w-full max-w-5xl flex-col gap-5"
      >
        <article class="border-b border-border/70 pb-5" data-testid="task-plan-overview">
          <div class="flex flex-wrap items-center gap-2">
            <Badge>{{ viewModel.statusText }}</Badge>
            <Badge variant="outline">{{ viewModel.importanceText }}</Badge>
            <Badge v-if="viewModel.goalBinding" variant="secondary">
              {{ t('task.occurrence.goalLinked') }}
            </Badge>
          </div>
          <p v-if="viewModel.description" class="mt-4 text-sm leading-6 text-muted-foreground">
            {{ viewModel.description }}
          </p>
          <div v-if="viewModel.labels?.length" class="mt-4 flex flex-wrap gap-1.5">
            <Badge v-for="label in viewModel.labels" :key="label.id" variant="outline">
              {{ label.name }}
            </Badge>
          </div>
        </article>

        <section
          aria-labelledby="task-plan-settings-heading"
          data-testid="task-plan-workspace-properties"
        >
          <div class="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 id="task-plan-settings-heading" class="font-semibold">
                {{ t('task.detail.planSettings') }}
              </h2>
              <p class="text-sm text-muted-foreground">
                {{ t('task.detail.planSettingsDescription') }}
              </p>
            </div>
            <Button size="sm" variant="outline" @click="openEdit">
              {{ t('task.detail.editSettings') }}
            </Button>
          </div>
          <dl class="divide-y border-y border-border/70" data-testid="task-detail-property-list">
            <div class="grid gap-1 py-3 @xl/panel:grid-cols-[10rem_minmax(0,1fr)] @xl/panel:gap-5">
              <dt class="text-xs font-medium text-muted-foreground">
                {{ t('task.detail.recurrence') }}
              </dt>
              <dd>
                <p class="text-sm font-medium">{{ viewModel.recurrenceText }}</p>
                <p class="mt-0.5 text-xs text-muted-foreground">{{ recurrenceBoundaryText }}</p>
              </dd>
            </div>
            <div class="grid gap-1 py-3 @xl/panel:grid-cols-[10rem_minmax(0,1fr)] @xl/panel:gap-5">
              <dt class="text-xs font-medium text-muted-foreground">
                {{ t('task.detail.schedule') }}
              </dt>
              <dd>
                <p class="text-sm font-medium">{{ scheduleText }}</p>
                <p class="mt-0.5 text-xs text-muted-foreground">{{ planStartText }}</p>
              </dd>
            </div>
            <div class="grid gap-1 py-3 @xl/panel:grid-cols-[10rem_minmax(0,1fr)] @xl/panel:gap-5">
              <dt class="text-xs font-medium text-muted-foreground">
                {{ t('task.detail.reminders') }}
              </dt>
              <dd>
                <p class="text-sm font-medium">{{ reminderText }}</p>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {{ t('task.detail.reminderAuthority') }}
                </p>
              </dd>
            </div>
            <div class="grid gap-1 py-3 @xl/panel:grid-cols-[10rem_minmax(0,1fr)] @xl/panel:gap-5">
              <dt class="text-xs font-medium text-muted-foreground">
                {{ t('task.detail.goalBinding') }}
              </dt>
              <dd>
                <p class="text-sm font-medium">{{ goalBindingText }}</p>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {{ t('task.detail.goalBindingDescription') }}
                </p>
              </dd>
            </div>
          </dl>
        </section>

        <section
          class="grid border-y border-border/70 @xl/panel:grid-cols-2 @xl/panel:divide-x"
          data-testid="task-detail-execution-summary"
        >
          <div class="py-4 @xl/panel:pr-5">
            <h2 class="font-semibold">{{ t('task.detail.executionStats') }}</h2>
            <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
              <span>{{ t('task.detail.totalInstances') }}: {{ executionSummary.total }}</span>
              <span>{{ t('task.detail.completed') }}: {{ executionSummary.completed }}</span>
              <span
                >{{ t('task.detail.completionRate') }}: {{ executionSummary.completionRate }}%</span
              >
              <span>{{
                t('task.detail.openCount', {
                  count: executionSummary.pending + executionSummary.inProgress,
                })
              }}</span>
              <span
                >{{ t('task.detail.instanceStatusMissed') }}: {{ executionSummary.missed }}</span
              >
              <span
                >{{ t('task.detail.instanceStatusSkipped') }}: {{ executionSummary.skipped }}</span
              >
            </div>
          </div>
          <div class="border-t py-4 @xl/panel:border-t-0 @xl/panel:pl-5">
            <h2 class="font-semibold">{{ t('task.detail.goalBinding') }}</h2>
            <p class="mt-3 text-sm" data-testid="task-detail-goal-context">{{ goalContextText }}</p>
            <p v-if="goalContextKeyResultText" class="mt-1 text-sm text-muted-foreground">
              {{ goalContextKeyResultText }}
            </p>
          </div>
        </section>

        <section data-testid="task-detail-linked-notes">
          <h2 class="font-semibold">{{ t('task.detail.linkedNotes') }}</h2>
          <div v-if="linkedNotes.length" class="mt-3 divide-y border-y border-border/70">
            <div v-for="note in linkedNotes" :key="note.relationId" class="py-3 text-sm">
              <template v-if="note.state === 'Resolved'">
                <div class="font-medium">{{ note.title }}</div>
                <div class="text-muted-foreground">{{ note.relativePath }}</div>
                <p class="mt-1 text-muted-foreground">{{ note.excerpt }}</p>
              </template>
              <span v-else class="text-muted-foreground">{{
                t('task.detail.linkedNoteMissing')
              }}</span>
            </div>
          </div>
          <p v-else class="mt-2 text-sm text-muted-foreground">
            {{ t('task.detail.noLinkedNotes') }}
          </p>
        </section>

        <section
          aria-labelledby="task-occurrence-history-heading"
          data-testid="task-detail-occurrences"
        >
          <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="task-occurrence-history-heading" class="font-semibold">
                {{ t('task.detail.occurrences') }}
              </h2>
              <p class="text-sm text-muted-foreground">
                {{ t('task.detail.occurrencesDescription') }}
              </p>
            </div>
            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{{
                t('task.detail.completedCount', { count: executionSummary.completed })
              }}</span>
              <span aria-hidden="true">·</span>
              <span>{{
                t('task.detail.openCount', {
                  count: executionSummary.pending + executionSummary.inProgress,
                })
              }}</span>
            </div>
          </div>

          <div v-if="templateOccurrences.length" class="grid gap-3">
            <TaskOccurrenceRow
              v-for="occurrence in sortedOccurrences"
              :key="occurrence.id"
              :occurrence="occurrence"
              :template="currentTemplate"
              :busy="busyOccurrenceId === String(occurrence.id)"
              @open-plan="noop"
              @complete="completeOccurrence"
              @uncomplete="uncompleteOccurrence"
              @missed="markOccurrenceMissed"
              @skip="skipOccurrence"
              @checklist-change="setOccurrenceChecklistItem"
            />
          </div>
          <div
            v-else
            class="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground"
            data-testid="task-detail-occurrences-empty"
          >
            {{ t('task.detail.noOccurrences') }}
          </div>
        </section>
      </div>

      <div
        v-else
        class="flex min-h-72 items-center justify-center text-sm text-muted-foreground"
        data-testid="task-detail-not-found"
      >
        {{ t('task.detail.notFound') }}
      </div>
    </main>

    <TaskPlanDialog
      v-model="showEditDialog"
      mode="edit"
      :template="viewModel"
      :saving="isSaving"
      @save="saveEdit"
      @cancel="showEditDialog = false"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  Archive,
  ArrowLeft,
  CircleAlert,
  Loader2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
} from '@lucide/vue';
import { Badge, Button, useConfirm } from '@memoflow/ui-vue-shadcn';
import type { GoalId, KeyResultId } from '@memoflow/contracts/primitives';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import type { TaskReminderConfigDTO } from '@memoflow/contracts/task';
import ModuleHeader from '../../../components/shared/ModuleHeader.vue';
import TaskOccurrenceRow from '../components/TaskOccurrenceRow.vue';
import TaskPlanDialog from '../components/dialogs/TaskPlanDialog.vue';
import type { TaskPlanViewModel } from '../components/types';
import { useTaskOccurrences } from '../composables/useTaskOccurrences';
import { useTaskPlanWorkspaceQuery } from '../composables/useTaskPlanWorkspaceQuery';
import { useTaskPlanMutations } from '../composables/useTaskPlanMutations';
import {
  getTaskPlanScheduleDate,
  getTaskPlanScheduleTimeDisplay,
  mapTaskPlanDtoToViewModel,
  toTaskPlanSchedulePayload,
} from '../utils/task-plan-presentation';
import { sortTaskOccurrences } from '../utils/task-occurrence-presentation';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const id = computed(() => String(route.params.id ?? ''));
const {
  workspace,
  query: workspaceQuery,
  refetch: refetchWorkspace,
} = useTaskPlanWorkspaceQuery(id);
const {
  updatePlanSafe,
  activatePlanSafe,
  pausePlanSafe,
  archivePlanSafe,
  deletePlanSafe,
  isSaving,
} = useTaskPlanMutations();
const {
  completeOccurrence: completeOccurrenceMutation,
  uncompleteOccurrence: uncompleteOccurrenceMutation,
  markOccurrenceMissed: markOccurrenceMissedMutation,
  skipOccurrence: skipOccurrenceMutation,
  setOccurrenceChecklistItem: setOccurrenceChecklistItemMutation,
} = useTaskOccurrences();
const currentTemplate = computed(() => workspace.value?.plan ?? null);
const viewModel = computed(() =>
  currentTemplate.value ? mapTaskPlanDtoToViewModel(currentTemplate.value, t) : null,
);
const showEditDialog = ref(false);
const busyOccurrenceId = ref<string | null>(null);
const isLoading = computed(() => workspaceQuery.isPending.value);
const loadError = computed(() => workspaceQuery.isError.value);
const templateOccurrences = computed(() => workspace.value?.recentOccurrences ?? []);
const sortedOccurrences = computed(() =>
  sortTaskOccurrences(templateOccurrences.value, 'time', () => viewModel.value?.title ?? ''),
);
const executionSummary = computed(
  () =>
    workspace.value?.occurrenceSummary ?? {
      total: 0,
      completed: 0,
      missed: 0,
      skipped: 0,
      pending: 0,
      inProgress: 0,
      completionRate: 0,
    },
);
const linkedNotes = computed(() => workspace.value?.linkedNotes ?? []);
const goalContextText = computed(() => {
  const context = workspace.value?.goalContext;
  if (!context) return t('task.detail.goalBindingNone');
  if (context.availability === 'Available') return context.goal.name;
  return t(`task.detail.goalContext${context.availability}`);
});
const goalContextKeyResultText = computed(() => {
  const context = workspace.value?.goalContext;
  return context?.availability === 'Available' && context.keyResult
    ? t('task.detail.keyResultValue', { name: context.keyResult.title })
    : null;
});
const scheduleText = computed(() =>
  getTaskPlanScheduleTimeDisplay(t, currentTemplate.value?.schedule),
);
const planStartText = computed(() => {
  const schedule = currentTemplate.value?.schedule;
  if (!schedule) return t('task.detail.noStartDate');
  return t('task.detail.startsOn', { date: getTaskPlanScheduleDate(schedule) });
});
const recurrenceBoundaryText = computed(() => {
  const schedule = currentTemplate.value?.schedule;
  if (!schedule || schedule.kind === 'OneTime') return t('task.detail.oneTimePlan');
  const end = schedule.recurrence.end;
  if (end.kind === 'Count') return t('task.detail.occurrenceLimit', { count: end.count });
  if (end.kind === 'Until') return t('task.detail.endsOn', { date: end.date });
  return t('task.detail.noRecurrenceEnd');
});
const reminderText = computed(() => {
  const reminder = currentTemplate.value?.reminderConfig as
    TaskReminderConfigDTO | null | undefined;
  if (!reminder?.enabled) return t('task.detail.remindersOff');
  return t('task.detail.reminderCount', { count: reminder.triggers.length });
});
const goalBindingText = computed(() =>
  currentTemplate.value?.goalBinding
    ? t('task.detail.goalBindingConfigured')
    : t('task.detail.goalBindingNone'),
);

function openEdit() {
  showEditDialog.value = true;
}
function goalBinding(vm: TaskPlanViewModel) {
  if (!vm.goalBinding?.goalId) return null;
  return {
    goalId: vm.goalBinding.goalId as GoalId,
    keyResultId: vm.goalBinding.keyResultId ? (vm.goalBinding.keyResultId as KeyResultId) : null,
    contribution: vm.goalBinding.keyResultId ? (vm.goalBinding.contribution ?? null) : null,
  };
}
async function saveEdit(vm: TaskPlanViewModel) {
  const result = await updatePlanSafe(id.value, {
    name: vm.title,
    description: vm.description ?? null,
    schedule: toTaskPlanSchedulePayload(vm),
    reminderConfig: (vm.reminderConfig as never) ?? null,
    importance: (vm.importance as ImportanceLevel) ?? ImportanceLevel.Moderate,
    labelIds: vm.labelIds ?? vm.labels?.map((label) => label.id) ?? [],
    goalBinding: goalBinding(vm),
    checklist: vm.checklist,
  });
  if (result) {
    showEditDialog.value = false;
    await reloadDetail();
  }
}
async function pause() {
  if (await pausePlanSafe(id.value)) await refetchWorkspace();
}
async function activate() {
  if (await activatePlanSafe(id.value)) await refetchWorkspace();
}
async function archive() {
  if (await archivePlanSafe(id.value)) await reloadDetail();
}
async function remove() {
  const confirmed = await useConfirm({
    title: t('task.management.deletePlan'),
    description: t('task.management.confirmDelete', { name: viewModel.value?.title ?? '' }),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  if (await deletePlanSafe(id.value)) await router.push({ name: 'task-list' });
}
async function reloadDetail() {
  await refetchWorkspace();
}
async function runOccurrenceAction(occurrenceId: string, action: (id: string) => Promise<unknown>) {
  busyOccurrenceId.value = occurrenceId;
  try {
    if (await action(occurrenceId)) await refetchWorkspace();
  } finally {
    busyOccurrenceId.value = null;
  }
}
const completeOccurrence = (occurrenceId: string) =>
  runOccurrenceAction(occurrenceId, completeOccurrenceMutation);
const uncompleteOccurrence = (occurrenceId: string) =>
  runOccurrenceAction(occurrenceId, uncompleteOccurrenceMutation);
const markOccurrenceMissed = (occurrenceId: string) =>
  runOccurrenceAction(occurrenceId, markOccurrenceMissedMutation);
const skipOccurrence = (occurrenceId: string) =>
  runOccurrenceAction(occurrenceId, skipOccurrenceMutation);
const setOccurrenceChecklistItem = (
  occurrenceId: string,
  definitionId: string,
  completed: boolean,
  expectedVersion: number,
) =>
  runOccurrenceAction(occurrenceId, (id) =>
    setOccurrenceChecklistItemMutation(id, { definitionId, completed, expectedVersion }),
  );
const noop = () => undefined;
</script>
