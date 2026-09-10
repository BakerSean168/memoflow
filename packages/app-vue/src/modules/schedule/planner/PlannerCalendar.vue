<template>
  <section
    class="planner-calendar relative h-full min-h-0 overflow-hidden bg-background"
    data-testid="schedule-fullcalendar"
    :aria-busy="loading"
  >
    <FullCalendar ref="calendarRef" :options="calendarOptions">
      <template #eventContent="{ event, timeText }">
        <div
          class="planner-event min-w-0 overflow-hidden px-0.5"
          :class="eventToneClass(event.extendedProps.projection)"
          :data-testid="`schedule-event-content-${event.extendedProps.projection.sourceType}-${event.extendedProps.projection.sourceId}`"
        >
          <span v-if="timeText" class="mr-1 font-medium">{{ timeText }}</span>
          <span class="truncate font-medium">{{ event.title }}</span>
          <span
            v-if="event.extendedProps.projection.displayMetadata.hasConflict"
            class="ml-1"
            aria-hidden="true"
            >⚠</span
          >
        </div>
      </template>
    </FullCalendar>

    <div
      v-if="loading"
      class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/55 backdrop-blur-[1px]"
      data-testid="schedule-calendar-loading"
    >
      <Loader2 class="h-7 w-7 animate-spin text-muted-foreground" aria-hidden="true" />
      <span class="sr-only">{{ loadingLabel }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import 'temporal-polyfill/global';
import '@fullcalendar/vue3/skeleton.css';
import '@fullcalendar/vue3/themes/classic/theme.css';
import FullCalendar from '@fullcalendar/vue3';
import interactionPlugin from '@fullcalendar/vue3/interaction';
import dayGridPlugin from '@fullcalendar/vue3/daygrid';
import timeGridPlugin from '@fullcalendar/vue3/timegrid';
import classicThemePlugin from '@fullcalendar/vue3/themes/classic';
import zhCnLocale from '@fullcalendar/vue3/locales/zh-cn';
import type { CalendarApi, CalendarOptions, EventApi, EventInput } from '@fullcalendar/vue3';
import type { CalendarEventProjection } from '@memoflow/contracts/schedule';
import { Loader2 } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { getProductTime, productTimeRevision } from '../../../shared/utils/product-time';
import {
  applyFullCalendarPlannerMutation,
  defaultPlannerMutationTimePort,
  type PlannerMutationOutcome,
  type PlannerOwnerCommandRouter,
} from './index';

export type PlannerCalendarView = 'day' | 'week' | 'month';

export interface PlannerVisibleRange {
  readonly start: number;
  /** Inclusive millisecond end used by MemoFlow read ports. */
  readonly end: number;
  readonly title: string;
  readonly view: PlannerCalendarView;
}

const props = withDefaults(
  defineProps<{
    projections: readonly CalendarEventProjection[];
    ownerCommands: PlannerOwnerCommandRouter;
    view: PlannerCalendarView;
    loading?: boolean;
    initialDate?: number;
    locale?: string;
    loadingLabel?: string;
  }>(),
  {
    loading: false,
    initialDate: () => Date.now(),
    locale: 'en-US',
    loadingLabel: 'Loading',
  },
);

const emit = defineEmits<{
  (e: 'range-change', range: PlannerVisibleRange): void;
  (e: 'event-click', projection: CalendarEventProjection): void;
  (e: 'day-click', date: Date): void;
  (e: 'mutation', outcome: PlannerMutationOutcome): void;
  (e: 'select-range', range: { start: number; end: number; allDay: boolean }): void;
}>();

const calendarRef = ref<{ getApi(): CalendarApi } | null>(null);
const lastVisibleRangeKey = ref<string | null>(null);

const fullCalendarView: Record<PlannerCalendarView, string> = {
  day: 'timeGridDay',
  week: 'timeGridWeek',
  month: 'dayGridMonth',
};

function projectionToEvent(projection: CalendarEventProjection): EventInput {
  return {
    id: `${projection.sourceType}:${projection.sourceId}`,
    title: projection.title,
    start: projection.start,
    end: projection.end ?? undefined,
    allDay: projection.allDay,
    editable: projection.editableCapabilities.move || projection.editableCapabilities.resize,
    startEditable: projection.editableCapabilities.move,
    durationEditable: projection.editableCapabilities.resize,
    classNames: [
      `planner-source-${projection.sourceType}`,
      projection.displayMetadata.hasConflict ? 'planner-event-conflict' : '',
    ].filter(Boolean),
    extendedProps: { projection },
  };
}

function projectionOf(event: EventApi): CalendarEventProjection | null {
  return (event.extendedProps.projection as CalendarEventProjection | undefined) ?? null;
}

function plannerViewFromFullCalendar(type: string): PlannerCalendarView {
  if (type === 'timeGridDay') return 'day';
  if (type === 'dayGridMonth') return 'month';
  return 'week';
}

async function applyMutation(
  kind: 'move' | 'resize',
  info:
    | Parameters<NonNullable<CalendarOptions['eventDrop']>>[0]
    | Parameters<NonNullable<CalendarOptions['eventResize']>>[0],
): Promise<void> {
  const outcome = await applyFullCalendarPlannerMutation(
    kind,
    info,
    props.ownerCommands,
    defaultPlannerMutationTimePort,
  );
  emit('mutation', outcome);
}

const calendarOptions = computed<CalendarOptions>(() => {
  void productTimeRevision.value;
  const productTime = getProductTime();
  return {
    plugins: [interactionPlugin, dayGridPlugin, timeGridPlugin, classicThemePlugin],
    initialView: fullCalendarView[props.view],
    initialDate: new Date(props.initialDate),
    headerToolbar: false,
    locales: [zhCnLocale],
    locale: props.locale.toLowerCase().startsWith('zh') ? 'zh-cn' : 'en',
    timeZone: String(productTime.context.timeZone),
    firstDay: productTime.context.weekStartsOn,
    height: '100%',
    nowIndicator: true,
    selectable: true,
    selectMirror: true,
    editable: true,
    allDaySlot: true,
    dayMaxEvents: 3,
    slotDuration: '00:30:00',
    slotMinTime: '00:00:00',
    slotMaxTime: '24:00:00',
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    events: props.projections.map(projectionToEvent),
    datesSet(info) {
      const range: PlannerVisibleRange = {
        start: info.start.getTime(),
        end: Math.max(info.start.getTime(), info.end.getTime() - 1),
        title: info.view.title,
        view: plannerViewFromFullCalendar(info.view.type),
      };
      const rangeKey = `${range.view}:${range.start}:${range.end}:${range.title}`;
      if (lastVisibleRangeKey.value === rangeKey) return;
      lastVisibleRangeKey.value = rangeKey;
      emit('range-change', range);
    },
    eventClick(info) {
      const projection = projectionOf(info.event);
      if (projection) emit('event-click', projection);
    },
    eventDidMount(info) {
      const projection = projectionOf(info.event);
      if (!projection) return;
      info.el.setAttribute('role', 'button');
      info.el.setAttribute('tabindex', '0');
      info.el.setAttribute('aria-label', projection.title);
      info.el.setAttribute(
        'data-testid',
        `schedule-event-${projection.sourceType}-${projection.sourceId}`,
      );
      info.el.onkeydown = (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        emit('event-click', projection);
      };
    },
    eventWillUnmount(info) {
      info.el.onkeydown = null;
    },
    dayCellDidMount(info) {
      const dayKey = String(productTime.calendar.toYmd(info.date.getTime()));
      info.el.setAttribute('data-testid', 'schedule-day-' + dayKey);
    },
    dateClick(info) {
      if (info.view.type === 'dayGridMonth') emit('day-click', info.date);
    },
    select(info) {
      emit('select-range', {
        start: info.start.getTime(),
        end: info.end.getTime(),
        allDay: info.allDay,
      });
    },
    eventDrop: (info) => void applyMutation('move', info),
    eventResize: (info) => void applyMutation('resize', info),
  };
});

watch(
  () => props.view,
  (view) => {
    const api = calendarRef.value?.getApi();
    if (api && api.view.type !== fullCalendarView[view]) api.changeView(fullCalendarView[view]);
  },
);

function api(): CalendarApi | null {
  return calendarRef.value?.getApi() ?? null;
}

function previous(): void {
  api()?.prev();
}

function next(): void {
  api()?.next();
}

function today(): void {
  api()?.today();
}

function goToDate(date: Date | number): void {
  api()?.gotoDate(date instanceof Date ? date : new Date(date));
}

function showDate(view: PlannerCalendarView, date: Date | number): void {
  const calendar = api();
  if (!calendar) return;
  calendar.changeView(fullCalendarView[view], date instanceof Date ? date : new Date(date));
}

defineExpose({ previous, next, today, goToDate, showDate });

function eventToneClass(projection: CalendarEventProjection): string {
  if (projection.displayMetadata.hasConflict) return 'planner-tone-warning';
  return `planner-tone-${projection.displayMetadata.tone ?? 'default'}`;
}
</script>

<style scoped>
.planner-calendar :deep(.fc) {
  height: 100%;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
}

.planner-calendar :deep(.fc-theme-standard td),
.planner-calendar :deep(.fc-theme-standard th),
.planner-calendar :deep(.fc-theme-standard .fc-scrollgrid) {
  border-color: hsl(var(--border));
}

.planner-calendar :deep(.fc-col-header-cell-cushion),
.planner-calendar :deep(.fc-daygrid-day-number),
.planner-calendar :deep(.fc-timegrid-axis-cushion),
.planner-calendar :deep(.fc-timegrid-slot-label-cushion) {
  color: hsl(var(--muted-foreground));
  text-decoration: none;
}

.planner-calendar :deep(.fc-day-today) {
  background: hsl(var(--primary) / 0.05) !important;
}

.planner-calendar :deep(.fc-event) {
  border-color: transparent;
  cursor: pointer;
}

.planner-calendar :deep(.planner-source-schedule) {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}

.planner-calendar :deep(.planner-source-task) {
  background: hsl(var(--info));
  color: hsl(var(--primary-foreground));
}

.planner-calendar :deep(.planner-source-goal),
.planner-calendar :deep(.planner-tone-success) {
  background: hsl(var(--success));
  color: hsl(var(--primary-foreground));
}

.planner-calendar :deep(.planner-source-routine),
.planner-calendar :deep(.planner-tone-muted) {
  opacity: 0.78;
}

.planner-calendar :deep(.planner-event-conflict),
.planner-calendar :deep(.planner-tone-warning) {
  background: hsl(var(--warning));
  color: hsl(var(--warning-foreground, var(--foreground)));
}

.planner-calendar :deep(.fc-more-link) {
  color: hsl(var(--primary));
}
</style>
