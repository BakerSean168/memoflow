<template>
  <section
    class="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    data-testid="task-detail-view"
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
        <article class="rounded-xl border bg-card p-5" data-testid="task-plan-overview">
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

        <section aria-labelledby="task-plan-settings-heading" data-testid="task-plan-settings">
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
          <dl class="grid gap-3 @xl/panel:grid-cols-2 @3xl/panel:grid-cols-4">
            <div class="rounded-xl border bg-card p-4">
              <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {{ t('task.detail.recurrence') }}
              </dt>
              <dd class="mt-2 text-sm font-medium">{{ viewModel.recurrenceText }}</dd>
              <dd class="mt-1 text-xs text-muted-foreground">{{ recurrenceBoundaryText }}</dd>
            </div>
            <div class="rounded-xl border bg-card p-4">
              <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {{ t('task.detail.schedule') }}
              </dt>
              <dd class="mt-2 text-sm font-medium">{{ scheduleText }}</dd>
              <dd class="mt-1 text-xs text-muted-foreground">{{ planStartText }}</dd>
            </div>
            <div class="rounded-xl border bg-card p-4">
              <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {{ t('task.detail.reminders') }}
              </dt>
              <dd class="mt-2 text-sm font-medium">{{ reminderText }}</dd>
              <dd class="mt-1 text-xs text-muted-foreground">
                {{ t('task.detail.reminderAuthority') }}
              </dd>
            </div>
            <div class="rounded-xl border bg-card p-4">
              <dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {{ t('task.detail.goalBinding') }}
              </dt>
              <dd class="mt-2 text-sm font-medium">{{ goalBindingText }}</dd>
              <dd class="mt-1 text-xs text-muted-foreground">
                {{ t('task.detail.goalBindingDescription') }}
              </dd>
            </div>
          </dl>
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
              <span>{{ t('task.detail.completedCount', { count: completedCount }) }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ t('task.detail.openCount', { count: openCount }) }}</span>
            </div>
          </div>

          <div v-if="templateOccurrences.length" class="grid gap-3">
            <TaskOccurrenceRow
              v-for="occurrence in sortedOccurrences"
              :key="occurrence.id"
              :occurrence="occurrence"
              :template="currentTemplate"
              :position="occurrencePositions.get(String(occurrence.id))"
              :busy="busyOccurrenceId === String(occurrence.id)"
              @open-plan="noop"
              @complete="completeOccurrence"
              @uncomplete="uncompleteOccurrence"
              @missed="markOccurrenceMissed"
              @skip="skipOccurrence"
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
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
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
import { formatProductDate } from '../../../shared/utils/product-time';
import TaskOccurrenceRow from '../components/TaskOccurrenceRow.vue';
import TaskPlanDialog from '../components/dialogs/TaskPlanDialog.vue';
import type { TaskPlanViewModel } from '../components/types';
import { useTaskStore } from '../stores/task-store';
import { useTaskOccurrences } from '../composables/useTaskOccurrences';
import { useTaskPlanDetailQuery } from '../composables/useTaskPlanDetailQuery';
import { useTaskPlanMutations } from '../composables/useTaskPlanMutations';
import {
  getTaskPlanScheduleDate,
  getTaskPlanScheduleTimeDisplay,
  mapTaskPlanDtoToViewModel,
  toTaskPlanSchedulePayload,
} from '../utils/task-plan-presentation';
import {
  getTaskOccurrencePosition,
  sortTaskOccurrences,
} from '../utils/task-occurrence-presentation';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const id = computed(() => String(route.params.id ?? ''));
const {
  currentTemplate,
  isLoading: templateLoading,
  isError: templateError,
  refetch,
} = useTaskPlanDetailQuery(id);
const {
  updateTemplateSafe,
  activateTemplateSafe,
  pauseTemplateSafe,
  archiveTemplateSafe,
  deleteTemplateSafe,
  isSaving,
} = useTaskPlanMutations();
const { fetchInstances, completeInstance, uncompleteInstance, markInstanceMissed, skipInstance } =
  useTaskOccurrences();
const taskStore = useTaskStore();
const { instances, isLoading: instancesLoading, error: instancesError } = storeToRefs(taskStore);
const viewModel = computed(() =>
  currentTemplate.value ? mapTaskPlanDtoToViewModel(currentTemplate.value, t) : null,
);
const showEditDialog = ref(false);
const busyOccurrenceId = ref<string | null>(null);
const isLoading = computed(() => templateLoading.value || instancesLoading.value);
const loadError = computed(() => templateError.value || Boolean(instancesError.value));
const templateOccurrences = computed(() =>
  instances.value.filter((occurrence) => String(occurrence.templateId) === id.value),
);
const sortedOccurrences = computed(() =>
  sortTaskOccurrences(templateOccurrences.value, 'time', () => viewModel.value?.title ?? ''),
);
const occurrencePositions = computed(
  () =>
    new Map(
      templateOccurrences.value.map((occurrence) => [
        String(occurrence.id),
        getTaskOccurrencePosition(occurrence, templateOccurrences.value, currentTemplate.value),
      ]),
    ),
);
const completedCount = computed(
  () => templateOccurrences.value.filter((occurrence) => occurrence.status === 'Completed').length,
);
const openCount = computed(
  () =>
    templateOccurrences.value.filter(
      (occurrence) => occurrence.status === 'Pending' || occurrence.status === 'InProgress',
    ).length,
);
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
  const result = await updateTemplateSafe(id.value, {
    name: vm.title,
    description: vm.description ?? null,
    schedule: toTaskPlanSchedulePayload(vm),
    reminderConfig: (vm.reminderConfig as never) ?? null,
    importance: (vm.importance as ImportanceLevel) ?? ImportanceLevel.Moderate,
    labelIds: vm.labelIds ?? vm.labels?.map((label) => label.id) ?? [],
    goalBinding: goalBinding(vm),
  });
  if (result) {
    showEditDialog.value = false;
    await reloadDetail();
  }
}
async function pause() {
  if (await pauseTemplateSafe(id.value)) await refetch();
}
async function activate() {
  if (await activateTemplateSafe(id.value)) await refetch();
}
async function archive() {
  if (await archiveTemplateSafe(id.value)) await reloadDetail();
}
async function remove() {
  const confirmed = await useConfirm({
    title: t('task.management.deleteTemplate'),
    description: t('task.management.confirmDelete', { name: viewModel.value?.title ?? '' }),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  if (await deleteTemplateSafe(id.value)) await router.push({ name: 'task-list' });
}
async function reloadDetail() {
  await Promise.all([refetch(), fetchInstances({ page: 1, limit: 500, templateId: id.value })]);
}
async function runOccurrenceAction(instanceId: string, action: (id: string) => Promise<unknown>) {
  busyOccurrenceId.value = instanceId;
  try {
    await action(instanceId);
  } finally {
    busyOccurrenceId.value = null;
  }
}
const completeOccurrence = (instanceId: string) =>
  runOccurrenceAction(instanceId, completeInstance);
const uncompleteOccurrence = (instanceId: string) =>
  runOccurrenceAction(instanceId, uncompleteInstance);
const markOccurrenceMissed = (instanceId: string) =>
  runOccurrenceAction(instanceId, markInstanceMissed);
const skipOccurrence = (instanceId: string) => runOccurrenceAction(instanceId, skipInstance);
const noop = () => undefined;

watch(
  id,
  (templateId) => {
    if (templateId) void fetchInstances({ page: 1, limit: 500, templateId });
  },
  { immediate: true },
);
</script>
