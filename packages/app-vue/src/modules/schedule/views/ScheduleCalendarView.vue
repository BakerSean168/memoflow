<template>
  <div
    class="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    data-testid="schedule-calendar-view"
  >
    <header
      class="z-10 flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.82)] px-2 py-1.5 shadow-[0_1px_0_hsl(var(--border)/0.04)] backdrop-blur-sm @2xl/panel:px-4"
      data-testid="schedule-page-toolbar"
    >
      <div
        class="flex min-w-0 items-center gap-0.5 rounded-lg bg-[hsl(var(--surface-raised)/0.55)] p-0.5 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.55)]"
        role="tablist"
        :aria-label="t('schedule.route.calendar')"
        data-testid="schedule-view-tabs"
      >
        <Button
          v-for="tab in viewTabs"
          :key="tab.value"
          variant="ghost"
          size="sm"
          role="tab"
          :aria-selected="activeView === tab.value"
          :aria-label="tab.label"
          :class="[
            'h-7 rounded-md px-2 text-[hsl(var(--foreground-muted))] shadow-none hover:bg-[hsl(var(--hover))] hover:text-foreground @xl/panel:px-3',
            activeView === tab.value
              ? 'bg-[hsl(var(--surface-overlay))] font-semibold text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.65)]'
              : '',
          ]"
          :data-testid="`schedule-view-tab-${tab.value}`"
          @click="changeView(tab.value)"
        >
          <component :is="tab.icon" class="h-4 w-4 @xl/panel:mr-1.5" />
          <span class="hidden @xl/panel:inline">{{ tab.label }}</span>
        </Button>
      </div>

      <div
        class="order-last flex w-full min-w-0 items-center justify-center gap-1 @3xl/panel:order-none @3xl/panel:w-auto"
        data-testid="schedule-period-navigation"
      >
        <Button
          variant="outline"
          size="icon"
          class="h-7 w-7 shrink-0 rounded-md border-transparent bg-transparent text-[hsl(var(--foreground-muted))] shadow-none hover:bg-[hsl(var(--hover))] hover:text-foreground"
          :aria-label="t('schedule.calendar.previousPeriod')"
          data-testid="schedule-previous-period"
          @click="movePeriod(-1)"
        >
          <ChevronLeft class="h-4 w-4" />
        </Button>
        <p
          class="min-w-0 max-w-48 flex-1 truncate px-2 text-center text-[13px] font-semibold tracking-[-0.01em] @3xl/panel:w-52 @3xl/panel:flex-none"
          data-testid="schedule-period-label"
        >
          {{ currentPeriodTitle }}
        </p>
        <Button
          variant="outline"
          size="icon"
          class="h-7 w-7 shrink-0 rounded-md border-transparent bg-transparent text-[hsl(var(--foreground-muted))] shadow-none hover:bg-[hsl(var(--hover))] hover:text-foreground"
          :aria-label="t('schedule.calendar.nextPeriod')"
          data-testid="schedule-next-period"
          @click="movePeriod(1)"
        >
          <ChevronRight class="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="h-7 shrink-0 border-transparent bg-transparent px-2 text-[12px] font-medium text-[hsl(var(--foreground-muted))] shadow-none hover:bg-[hsl(var(--hover))] hover:text-foreground"
          data-testid="schedule-today"
          @click="goToToday"
        >
          {{ t('schedule.calendar.today') }}
        </Button>
      </div>

      <ResponsivePrimaryAction
        class="ml-auto"
        :label="t('schedule.planning.createSchedule')"
        :icon="Plus"
        data-primary-action="create-schedule"
        data-testid="create-schedule-button"
        @click="openCreateDialog"
      />
    </header>

    <div class="min-h-0 flex-1 overflow-hidden" data-testid="schedule-calendar-content">
      <PlannerCalendar
        ref="plannerCalendarRef"
        :projections="projections"
        :conflicts="conflicts"
        :owner-commands="ownerCommands"
        :view="activeView"
        :locale="locale"
        :loading="isLoading"
        :loading-label="t('schedule.planning.loading')"
        @range-change="handleVisibleRange"
        @event-click="handleProjectionClick"
        @day-click="handleDayClick"
        @mutation="handlePlannerMutation"
        @select-range="handleSelectRange"
      />
    </div>

    <PlannerDayDialog
      v-model:open="dayDetailOpen"
      :date="selectedDate"
      :events="selectedDayEvents"
      :conflicts="conflicts"
      @event-click="handleProjectionClick"
      @view-in-day="switchToDayView"
      @complete-task="handleCompleteTask"
    />

    <TaskEventActionPanel
      v-model:open="taskPanelOpen"
      :event="selectedTaskEvent"
      @complete-task="handleCompleteTask"
    />

    <PlannerEventDialog
      v-model:open="eventDetailOpen"
      :event="selectedDetailEvent"
      :has-conflict="selectedDetailHasConflict"
      @edit="handleEditCalendarEntry"
      @delete="handleDeleteCalendarEntry"
    />
    <CreateScheduleDialog
      v-model="showCreateDialog"
      :schedule="editingSchedule"
      :initial-range="pendingCreateRange"
      :on-submit="handleSaveSchedule"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import {
  CalendarDays,
  Calendar,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Plus,
} from '@lucide/vue';
import { Button, useConfirm } from '@memoflow/ui-vue-shadcn';
import CreateScheduleDialog from '../components/CreateScheduleDialog.vue';
import PlannerDayDialog from '../components/PlannerDayDialog.vue';
import TaskEventActionPanel from '../components/TaskEventActionPanel.vue';
import PlannerEventDialog from '../components/PlannerEventDialog.vue';
import { toLocalDateKey, useCalendarView } from '../composables/useCalendarView';
import { useSchedule } from '../composables/useSchedule';
import { useTask } from '../../task/composables/useTask';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { ResponsivePrimaryAction } from '../../../shared/components';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { usePanelSurfaceStatus } from '../../../layouts/shell/usePanelSurfaceStatus';
import type { PanelSurfaceStatus } from '../../../layouts/shell/useAppShellStore';
import type {
  CalendarEntryClientDTO,
  CalendarEventProjection,
  CreateScheduleRequest,
  UpdateScheduleRequest,
} from '@memoflow/contracts/schedule';
import PlannerCalendar, {
  type PlannerCalendarView,
  type PlannerVisibleRange,
} from '../planner/PlannerCalendar.vue';
import { createPlannerOwnerCommandRouter, type PlannerMutationOutcome } from '../planner';
import {
  plannerProjectionDateKey,
  plannerProjectionKeyForUi,
} from '../planner/planner-presentation';
import { plannerConflictSourceKeys } from '@memoflow/schedule/client';
import { getProductTime, productTimeRevision } from '../../../shared/utils/product-time';

const { t, locale } = useI18n();
const { projections, conflicts, isLoading, fetchForRange, windowStart, windowEnd } =
  useCalendarView();
const schedule = useSchedule();
const task = useTask();
const goal = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');

const ownerCommands = createPlannerOwnerCommandRouter({
  schedule: { updateSchedule: schedule.updateCalendarEntry },
  task: {
    rescheduleOccurrence: (id, request) =>
      task.rescheduleOccurrence(id, request, { suppressErrorReport: true }),
  },
  goal: { updateGoal: goal.updateGoal.bind(goal) },
});

const plannerCalendarRef = ref<InstanceType<typeof PlannerCalendar> | null>(null);
const showCreateDialog = ref(false);
const pendingCreateRange = ref<{ start: number; end: number; allDay: boolean } | null>(null);
const editingSchedule = ref<CalendarEntryClientDTO | null>(null);
const activeView = ref<PlannerCalendarView>('week');
const currentPeriodTitle = ref('');
const dayDetailOpen = ref(false);
const selectedDate = ref<Date | null>(null);
const taskPanelOpen = ref(false);
const selectedTaskEvent = ref<Extract<CalendarEventProjection, { sourceType: 'task' }> | null>(
  null,
);
const eventDetailOpen = ref(false);
const selectedDetailEvent = ref<CalendarEventProjection | null>(null);

// Phase 0 / UI-004：日程创建/编辑弹窗打开即视为未完成操作——统一离开协议。
const surfaceStatus = computed<PanelSurfaceStatus>(() =>
  showCreateDialog.value ? 'dirty' : 'clean',
);
usePanelSurfaceStatus(surfaceStatus);

const selectedDayEvents = computed<CalendarEventProjection[]>(() => {
  if (!selectedDate.value) return [];
  const dateStr = toLocalDateKey(selectedDate.value);
  return projections.value.filter((event) => plannerProjectionDateKey(event) === dateStr);
});

const conflictKeys = computed(() => plannerConflictSourceKeys(conflicts.value));
const selectedDetailHasConflict = computed(() =>
  selectedDetailEvent.value
    ? conflictKeys.value.has(plannerProjectionKeyForUi(selectedDetailEvent.value))
    : false,
);

const viewTabs = computed(() => [
  { label: t('schedule.viewTabs.day'), value: 'day' as const, icon: Calendar },
  { label: t('schedule.viewTabs.week'), value: 'week' as const, icon: CalendarDays },
  { label: t('schedule.viewTabs.month'), value: 'month' as const, icon: CalendarRange },
]);

function changeView(view: PlannerCalendarView): void {
  activeView.value = view;
}

function formatPeriodTitle(range: PlannerVisibleRange): string {
  void productTimeRevision.value;
  const time = getProductTime();
  const presentation = { locale: locale.value };

  if (range.view === 'day') {
    return time.format.slot('periodDay', range.start, presentation);
  }
  if (range.view === 'month') {
    return time.format.slot('periodMonth', range.start, presentation);
  }

  const start = time.format.slot('periodRangeDay', range.start, presentation);
  const end = time.format.slot('periodRangeDay', range.end, presentation);
  return `${start} – ${end}`;
}

function handleVisibleRange(range: PlannerVisibleRange): void {
  currentPeriodTitle.value = formatPeriodTitle(range);
  if (activeView.value !== range.view) activeView.value = range.view;
  void fetchForRange(range.start, range.end);
}

function movePeriod(direction: -1 | 1): void {
  if (direction < 0) plannerCalendarRef.value?.previous();
  else plannerCalendarRef.value?.next();
}

function goToToday(): void {
  plannerCalendarRef.value?.today();
}

function handleProjectionClick(projection: CalendarEventProjection): void {
  if (projection.sourceType === 'task') {
    selectedTaskEvent.value = projection;
    taskPanelOpen.value = true;
    return;
  }

  dayDetailOpen.value = false;
  selectedDetailEvent.value = projection;
  eventDetailOpen.value = true;
}

async function handleCompleteTask(originalId: string): Promise<void> {
  const result = await task.completeOccurrence(originalId);
  if (result && windowStart.value && windowEnd.value) {
    await fetchForRange(windowStart.value, windowEnd.value);
  }
}

function plannerConflictMessage(
  outcome: Extract<PlannerMutationOutcome, { status: 'conflict' }>,
): string {
  if (outcome.reason === 'target-date-occupied') {
    return t('schedule.plannerMutation.taskTargetDayConflict');
  }

  if (outcome.reason === 'stale-version') {
    return t('schedule.plannerMutation.staleConflict');
  }

  return t('schedule.plannerMutation.conflict');
}

async function refreshPlannerAfterConflict(
  warningKey = 'schedule.plannerMutation.refreshFailed',
): Promise<void> {
  if (!windowStart.value || !windowEnd.value) return;
  try {
    await fetchForRange(windowStart.value, windowEnd.value);
  } catch {
    toast.warning(t(warningKey));
  }
}

function handlePlannerMutation(outcome: PlannerMutationOutcome): void {
  if (outcome.status === 'applied') return;

  if (outcome.status === 'conflict') {
    toast.warning(plannerConflictMessage(outcome));
    if (outcome.reason === 'stale-version') {
      void refreshPlannerAfterConflict();
    }
    return;
  }

  if (outcome.status === 'read-only') {
    toast.info(t('schedule.plannerMutation.readOnly'));
    return;
  }

  if (outcome.status === 'invalid') {
    toast.error(t('schedule.plannerMutation.invalid'));
    return;
  }

  if (outcome.status === 'unsupported') {
    toast.error(t('schedule.plannerMutation.unsupported'));
    return;
  }

  toast.error(t('schedule.plannerMutation.failed'));
}

function handleDayClick(date: Date): void {
  selectedDate.value = date;
  dayDetailOpen.value = true;
}

function switchToDayView(date: Date | null): void {
  if (!date) return;
  dayDetailOpen.value = false;
  activeView.value = 'day';
  plannerCalendarRef.value?.showDate('day', date);
}

function openCreateDialog(): void {
  editingSchedule.value = null;
  pendingCreateRange.value = null;
  showCreateDialog.value = true;
}

function handleSelectRange(range: { start: number; end: number; allDay: boolean }): void {
  editingSchedule.value = null;
  pendingCreateRange.value = range;
  showCreateDialog.value = true;
}

function resolveCalendarEntry(event: CalendarEventProjection): CalendarEntryClientDTO | null {
  if (event.sourceType !== 'schedule') return null;
  const entry = schedule.calendarEntries.value.find(
    (entry) => String(entry.id) === event.ownerCommandTarget.ownerId,
  );
  if (!entry || entry.version !== event.revision) {
    toast.error(t('schedule.eventDetail.entryUnavailable'));
    void refreshPlannerAfterConflict('schedule.eventDetail.refreshFailed');
    return null;
  }
  return entry;
}

function handleEditCalendarEntry(event: CalendarEventProjection): void {
  const entry = resolveCalendarEntry(event);
  if (!entry) return;

  selectedDetailEvent.value = event;
  eventDetailOpen.value = false;
  editingSchedule.value = entry;
  pendingCreateRange.value = null;
  showCreateDialog.value = true;
}

async function handleDeleteCalendarEntry(event: CalendarEventProjection): Promise<void> {
  const entry = resolveCalendarEntry(event);
  if (!entry) return;

  eventDetailOpen.value = false;
  const confirmed = await useConfirm({
    title: t('schedule.confirm.deleteCalendarEntryTitle', { name: entry.title }),
    description: t('schedule.confirm.deleteCalendarEntryDescription'),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    eventDetailOpen.value = true;
    return;
  }

  // Confirmation may remain open while owner facts change.
  if (!resolveCalendarEntry(event)) {
    eventDetailOpen.value = true;
    return;
  }
  const deleted = await schedule.deleteCalendarEntry(String(entry.id), entry.version);
  if (!deleted) {
    eventDetailOpen.value = true;
    toast.error(schedule.error.value ?? t('schedule.eventDetail.entryUnavailable'));
    await refreshPlannerAfterConflict('schedule.eventDetail.refreshFailed');
    return;
  }

  eventDetailOpen.value = false;
  selectedDetailEvent.value = null;
  await refreshAfterScheduleWrite('schedule.toast.scheduleDeletedRefreshFailed');
  toast.success(t('schedule.toast.scheduleDeleted'));
}

async function refreshAfterScheduleWrite(refreshFailureKey: string): Promise<void> {
  if (!windowStart.value || !windowEnd.value) return;
  try {
    await fetchForRange(windowStart.value, windowEnd.value);
    // Schedule owner reads report failures in the store rather than rejecting.
    if (schedule.error.value) toast.warning(t(refreshFailureKey));
  } catch {
    toast.warning(t(refreshFailureKey));
  }
}

async function handleSaveSchedule(data: CreateScheduleRequest): Promise<boolean> {
  const editing = editingSchedule.value;
  if (!editing) {
    const result = await schedule.createCalendarEntry(data);
    if (!result) return false;

    await refreshAfterScheduleWrite('schedule.toast.scheduleCreatedRefreshFailed');
    toast.success(t('schedule.toast.scheduleCreated'));
    return true;
  }

  const current = schedule.calendarEntries.value.find((entry) => entry.id === editing.id);
  if (!current || current.version !== editing.version) {
    toast.error(t('schedule.eventDetail.entryUnavailable'));
    await refreshPlannerAfterConflict('schedule.eventDetail.refreshFailed');
    return false;
  }

  const update: UpdateScheduleRequest = {
    name: data.name,
    description: data.description ?? '',
    range: data.range,
    location: data.location ?? '',
    attendees: data.attendees ?? [],
    expectedVersion: editing.version,
  };
  const result = await schedule.updateCalendarEntry(String(editing.id), update);
  if (!result.ok) {
    toast.error(schedule.error.value ?? t('schedule.eventDetail.entryUnavailable'));
    await refreshPlannerAfterConflict('schedule.eventDetail.refreshFailed');
    return false;
  }

  await refreshAfterScheduleWrite('schedule.toast.scheduleUpdatedRefreshFailed');
  selectedDetailEvent.value = null;
  toast.success(t('schedule.toast.scheduleUpdated'));
  return true;
}

watch(showCreateDialog, (open) => {
  if (open) return;
  editingSchedule.value = null;
  pendingCreateRange.value = null;
});
</script>
