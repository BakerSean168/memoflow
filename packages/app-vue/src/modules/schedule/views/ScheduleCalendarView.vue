<template>
  <div
    class="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    data-testid="schedule-calendar-view"
  >
    <header
      class="z-10 flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b bg-background/80 px-2 py-2 backdrop-blur-sm @2xl/panel:px-4"
      data-testid="schedule-page-toolbar"
    >
      <div
        class="flex min-w-0 items-center gap-1"
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
            'h-8 px-2 text-muted-foreground hover:text-foreground @xl/panel:px-3',
            activeView === tab.value ? 'bg-secondary font-medium text-foreground' : '',
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
          class="h-8 w-8 shrink-0"
          :aria-label="t('schedule.calendar.previousPeriod')"
          data-testid="schedule-previous-period"
          @click="movePeriod(-1)"
        >
          <ChevronLeft class="h-4 w-4" />
        </Button>
        <p
          class="min-w-0 max-w-44 flex-1 truncate text-center text-sm font-medium @3xl/panel:w-48 @3xl/panel:flex-none"
          data-testid="schedule-period-label"
        >
          {{ currentPeriodTitle }}
        </p>
        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8 shrink-0"
          :aria-label="t('schedule.calendar.nextPeriod')"
          data-testid="schedule-next-period"
          @click="movePeriod(1)"
        >
          <ChevronRight class="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="h-8 shrink-0 px-2"
          data-testid="schedule-today"
          @click="goToToday"
        >
          {{ t('schedule.calendar.today') }}
        </Button>
      </div>

      <Button
        size="sm"
        class="ml-auto h-8 shrink-0 px-2 @xl/panel:px-3"
        :aria-label="t('schedule.dashboard.createSchedule')"
        data-primary-action="create-schedule"
        data-testid="create-schedule-button"
        @click="showCreateDialog = true"
      >
        <Plus class="h-4 w-4 @xl/panel:mr-1.5" />
        <span class="hidden @xl/panel:inline">{{ t('schedule.dashboard.createSchedule') }}</span>
      </Button>
    </header>

    <div class="min-h-0 flex-1 overflow-hidden" data-testid="schedule-calendar-content">
      <PlannerCalendar
        ref="plannerCalendarRef"
        :projections="projections"
        :owner-commands="ownerCommands"
        :view="activeView"
        :locale="locale"
        :loading="isLoading"
        :loading-label="t('schedule.dashboard.loading')"
        @range-change="handleVisibleRange"
        @event-click="handleProjectionClick"
        @day-click="handleDayClick"
        @select-range="showCreateDialog = true"
      />
    </div>

    <DayDetailSheet
      v-model:open="dayDetailOpen"
      :date="selectedDate"
      :events="selectedDayEvents"
      @event-click="handleEventClick"
      @view-in-day="switchToDayView"
      @complete-task="handleCompleteTask"
    />

    <TaskEventActionPanel
      v-model:open="taskPanelOpen"
      :event="selectedTaskEvent"
      @complete-task="handleCompleteTask"
    />

    <EventDetailSheet v-model:open="eventDetailOpen" :event="selectedDetailEvent" />
    <CreateScheduleDialog v-model="showCreateDialog" :on-submit="handleCreateSchedule" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
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
import { Button } from '@memoflow/ui-vue-shadcn';
import CreateScheduleDialog from '../components/CreateScheduleDialog.vue';
import DayDetailSheet from '../components/DayDetailSheet.vue';
import TaskEventActionPanel from '../components/TaskEventActionPanel.vue';
import EventDetailSheet from '../components/EventDetailSheet.vue';
import { toLocalDateKey, useCalendarView } from '../composables/useCalendarView';
import { useSchedule } from '../composables/useSchedule';
import { useTask } from '../../task/composables/useTask';
import { usePanelSurfaceStatus } from '../../../layouts/shell/usePanelSurfaceStatus';
import type { PanelSurfaceStatus } from '../../../layouts/shell/useAppShellStore';
import type { CalendarEventItem } from '../composables/useCalendarView';
import type { CalendarEventProjection, CreateScheduleRequest } from '@memoflow/contracts/schedule';
import PlannerCalendar, {
  type PlannerCalendarView,
  type PlannerVisibleRange,
} from '../planner/PlannerCalendar.vue';
import { createPlannerOwnerCommandRouter } from '../planner';

const { t, locale } = useI18n();
const { projections, events, isLoading, fetchForRange, windowStart, windowEnd } = useCalendarView();
const schedule = useSchedule();
const task = useTask();

const ownerCommands = createPlannerOwnerCommandRouter({
  schedule: { updateSchedule: schedule.updateCalendarEntry },
  task: { rescheduleInstance: task.rescheduleInstance },
});

const plannerCalendarRef = ref<InstanceType<typeof PlannerCalendar> | null>(null);
const showCreateDialog = ref(false);
const activeView = ref<PlannerCalendarView>('week');
const currentPeriodTitle = ref('');
const dayDetailOpen = ref(false);
const selectedDate = ref<Date | null>(null);
const taskPanelOpen = ref(false);
const selectedTaskEvent = ref<CalendarEventItem | null>(null);
const eventDetailOpen = ref(false);
const selectedDetailEvent = ref<CalendarEventItem | null>(null);

// Phase 0 / UI-004：日程创建/编辑弹窗打开即视为未完成操作——统一离开协议。
const surfaceStatus = computed<PanelSurfaceStatus>(() =>
  showCreateDialog.value ? 'dirty' : 'clean',
);
usePanelSurfaceStatus(surfaceStatus);

const selectedDayEvents = computed<CalendarEventItem[]>(() => {
  if (!selectedDate.value) return [];
  const dateStr = toLocalDateKey(selectedDate.value);
  return events.value.filter((event) => toLocalDateKey(event.startTime) === dateStr);
});

const viewTabs = computed(() => [
  { label: t('schedule.viewTabs.day'), value: 'day' as const, icon: Calendar },
  { label: t('schedule.viewTabs.week'), value: 'week' as const, icon: CalendarDays },
  { label: t('schedule.viewTabs.month'), value: 'month' as const, icon: CalendarRange },
]);

function changeView(view: PlannerCalendarView): void {
  activeView.value = view;
}

function handleVisibleRange(range: PlannerVisibleRange): void {
  currentPeriodTitle.value = range.title;
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

function findLegacyEvent(projection: CalendarEventProjection): CalendarEventItem | null {
  if (projection.sourceType !== 'schedule' && projection.sourceType !== 'task') return null;
  return (
    events.value.find(
      (event) =>
        event.source === projection.sourceType &&
        event.originalId === projection.ownerCommandTarget.ownerId,
    ) ?? null
  );
}

function handleProjectionClick(projection: CalendarEventProjection): void {
  const event = findLegacyEvent(projection);
  if (event) handleEventClick(event);
}

function handleEventClick(event: CalendarEventItem): void {
  if (event.source === 'task') {
    selectedTaskEvent.value = event;
    taskPanelOpen.value = true;
  } else {
    selectedDetailEvent.value = event;
    eventDetailOpen.value = true;
  }
}

async function handleCompleteTask(originalId: string): Promise<void> {
  const result = await task.completeInstance(originalId);
  if (result && windowStart.value && windowEnd.value) {
    await fetchForRange(windowStart.value, windowEnd.value);
  }
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

async function handleCreateSchedule(data: CreateScheduleRequest): Promise<boolean> {
  const result = await schedule.createCalendarEntry(data);
  if (result) {
    if (windowStart.value && windowEnd.value) {
      try {
        await fetchForRange(windowStart.value, windowEnd.value);
      } catch {
        // The command already committed and the local Schedule store contains the returned DTO.
        // A read-model refresh failure must never be reported as a failed create.
        toast.warning(t('schedule.toast.scheduleCreatedRefreshFailed'));
      }
    }
    toast.success(t('schedule.toast.scheduleCreated'));
    return true;
  }
  return false;
}
</script>
