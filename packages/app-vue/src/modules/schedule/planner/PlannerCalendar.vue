<template>
  <section
    class="planner-calendar relative h-full min-h-0 overflow-hidden bg-background"
    data-testid="schedule-fullcalendar"
    :aria-busy="loading"
  >
    <FullCalendar ref="calendarRef" :options="calendarOptions">
      <template #eventContent="{ event }">
        <div
          v-if="event.extendedProps.projection"
          class="planner-event flex h-full min-w-0 items-start gap-1 overflow-hidden"
          :class="eventToneClass(event.extendedProps.projection)"
          :data-testid="`schedule-event-content-${event.extendedProps.projection.sourceType}-${event.extendedProps.projection.sourceId}`"
        >
          <span class="planner-event-title min-w-0 flex-1 truncate font-medium">
            {{ event.title }}
          </span>
          <TriangleAlert
            v-if="hasDerivedConflict(event.extendedProps.projection)"
            class="planner-event-conflict-icon shrink-0"
            aria-hidden="true"
          />
        </div>
        <div
          v-else
          class="planner-selection-preview h-full min-h-5 w-full"
          aria-hidden="true"
          data-testid="schedule-selection-preview"
        />
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
import type {
  CalendarEventProjection,
  PlannerConflictProjection,
} from '@memoflow/contracts/schedule';
import { plannerConflictSourceKeys, plannerProjectionKey } from '@memoflow/schedule/client';
import { Loader2, TriangleAlert } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { getProductTime, productTimeRevision } from '../../../shared/utils/product-time';
import {
  applyFullCalendarPlannerMutation,
  defaultPlannerMutationTimePort,
  type PlannerMutationOutcome,
  type PlannerOwnerCommandRouter,
} from './index';
import {
  plannerProjectionSourcePresentation,
  plannerProjectionToneClass,
} from './planner-presentation';

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
    conflicts?: readonly PlannerConflictProjection[];
    ownerCommands: PlannerOwnerCommandRouter;
    view: PlannerCalendarView;
    loading?: boolean;
    initialDate?: number;
    locale?: string;
    loadingLabel?: string;
  }>(),
  {
    loading: false,
    conflicts: () => [],
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

const conflictSourceKeys = computed(() => plannerConflictSourceKeys(props.conflicts));

function hasDerivedConflict(projection: CalendarEventProjection): boolean {
  return conflictSourceKeys.value.has(plannerProjectionKey(projection));
}

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
    // FullCalendar v7 uses singular className for event UI refiners.
    className: [
      'planner-source',
      plannerProjectionSourcePresentation[projection.sourceType].sourceClass,
      projection.allDay ? 'planner-event-all-day' : 'planner-event-timed',
      `planner-occupancy-${projection.occupancy}`,
      plannerProjectionToneClass(projection, hasDerivedConflict(projection)),
      hasDerivedConflict(projection) ? 'planner-event-conflict' : '',
    ]
      .filter(Boolean)
      .join(' '),
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
    slotHeaderInterval: '01:00:00',
    slotMinTime: '00:00:00',
    slotMaxTime: '24:00:00',
    slotMinHeight: 28,
    scrollTime: '06:00:00',
    scrollTimeReset: false,
    slotHeaderFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    dayHeaderFormat: { weekday: 'short', day: 'numeric' },
    displayEventTime: false,
    eventMinHeight: 26,
    eventShortHeight: 28,
    dayHeaderClass: (info) =>
      [
        'planner-day-header',
        info.isToday ? 'planner-day-header-today' : '',
        info.dow === 0 || info.dow === 6 ? 'planner-day-header-weekend' : '',
      ]
        .filter(Boolean)
        .join(' '),
    dayLaneClass: (info) =>
      [
        'planner-day-lane',
        info.isToday ? 'planner-day-lane-today' : '',
        info.dow === 0 || info.dow === 6 ? 'planner-day-lane-weekend' : '',
      ]
        .filter(Boolean)
        .join(' '),
    dayCellClass: (info) =>
      [
        'planner-day-cell',
        info.isToday ? 'planner-day-cell-today' : '',
        info.dow === 0 || info.dow === 6 ? 'planner-day-cell-weekend' : '',
      ]
        .filter(Boolean)
        .join(' '),
    slotHeaderClass: (info) =>
      `planner-slot-header ${info.isMinor ? 'planner-slot-header-minor' : 'planner-slot-header-major'}`,
    slotLaneClass: (info) =>
      `planner-slot-lane ${info.isMinor ? 'planner-slot-lane-minor' : 'planner-slot-lane-major'}`,
    tableHeaderClass: 'planner-table-header',
    tableBodyClass: 'planner-table-body',
    allDayHeaderClass: 'planner-all-day-header',
    dayHeaderDividerClass: 'planner-day-header-divider',
    slotHeaderDividerClass: 'planner-slot-header-divider',
    allDayDividerClass: 'planner-all-day-divider',
    moreLinkClass: 'planner-more-link',
    nowIndicatorLineClass: 'planner-now-line',
    nowIndicatorDotClass: 'planner-now-dot',
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
      const source = plannerProjectionSourcePresentation[projection.sourceType];
      info.el.style.setProperty('--planner-source-hsl', source.calendarColor);
      info.el.style.setProperty('--planner-source-foreground-hsl', source.calendarForeground);
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
  return plannerProjectionToneClass(projection, hasDerivedConflict(projection));
}
</script>

<style scoped>
/*
 * FullCalendar v7 intentionally hashes its internal CSS classes. Keep MemoFlow
 * styling on theme tokens plus public class hooks instead of targeting the old
 * v6-style .fc-timegrid-* selectors.
 */
.planner-calendar {
  --fc-classic-background: hsl(var(--background));
  --fc-classic-foreground: hsl(var(--foreground));
  --fc-classic-faint: hsl(var(--muted) / 0.05);
  --fc-classic-muted: hsl(var(--muted) / 0.08);
  --fc-classic-strong: hsl(var(--muted) / 0.14);
  --fc-classic-faint-foreground: hsl(var(--muted-foreground) / 0.55);
  --fc-classic-muted-foreground: hsl(var(--muted-foreground) / 0.78);
  --fc-classic-border: hsl(var(--border) / 0.2);
  --fc-classic-strong-border: hsl(var(--border) / 0.34);
  --fc-classic-today: hsl(var(--primary) / 0.028);
  --fc-classic-now: hsl(var(--destructive) / 0.72);
  height: 100%;
  color: hsl(var(--foreground));
  background:
    linear-gradient(hsl(var(--background) / 0.985), hsl(var(--background) / 0.985)),
    hsl(var(--background));
  font-size: 0.8125rem;
}

.planner-calendar :deep(.planner-table-header) {
  background: hsl(var(--surface) / 0.94);
  box-shadow: inset 0 -1px 0 hsl(var(--border) / 0.28);
}

.planner-calendar :deep(.planner-day-header) {
  min-height: 2.55rem;
  background: hsl(var(--surface) / 0.96);
  border-color: hsl(var(--border) / 0.22) !important;
}

.planner-calendar :deep(.planner-day-header-today) {
  background: hsl(var(--primary) / 0.09);
  box-shadow: inset 0 -2px 0 hsl(var(--primary) / 0.68);
}

.planner-calendar :deep(.planner-day-header-weekend:not(.planner-day-header-today)) {
  background: hsl(var(--muted) / 0.08);
}

.planner-calendar :deep(.planner-day-header a),
.planner-calendar :deep(.planner-day-header button) {
  padding: 0.68rem 0.4rem 0.58rem;
  color: hsl(var(--muted-foreground));
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1;
  text-decoration: none;
}

.planner-calendar :deep(.planner-day-header-today a),
.planner-calendar :deep(.planner-day-header-today button) {
  color: hsl(var(--primary));
}

.planner-calendar :deep(.planner-day-lane) {
  border-color: hsl(var(--border) / 0.18) !important;
  background: transparent;
}

.planner-calendar :deep(.planner-day-lane-today) {
  background: hsl(var(--primary) / 0.014);
}

.planner-calendar :deep(.planner-day-lane-weekend:not(.planner-day-lane-today)) {
  background: hsl(var(--muted) / 0.025);
}

.planner-calendar :deep(.planner-slot-header) {
  min-width: 3.6rem;
  color: hsl(var(--muted-foreground) / 0.72);
  font-size: 0.675rem;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  line-height: 1;
  background: hsl(var(--background));
}

.planner-calendar :deep(.planner-slot-header > *) {
  padding-inline: 0.35rem 0.6rem;
}

.planner-calendar :deep(.planner-slot-lane) {
  border-top-width: 1px !important;
  border-color: hsl(var(--border) / 0.18) !important;
}

.planner-calendar :deep(.planner-slot-lane-major) {
  border-top-style: solid !important;
  border-top-color: hsl(var(--border) / 0.28) !important;
}

.planner-calendar :deep(.planner-slot-lane-minor) {
  border-top-style: dotted !important;
  border-top-color: hsl(var(--border) / 0.11) !important;
}

.planner-calendar :deep(.planner-all-day-header) {
  color: hsl(var(--muted-foreground) / 0.82);
  font-size: 0.6875rem;
  font-weight: 600;
  background: hsl(var(--surface) / 0.76);
}

.planner-calendar :deep(.planner-day-header-divider),
.planner-calendar :deep(.planner-slot-header-divider),
.planner-calendar :deep(.planner-all-day-divider) {
  border-color: hsl(var(--border) / 0.22) !important;
  background: hsl(var(--border) / 0.07) !important;
}

.planner-calendar :deep(.planner-day-cell) {
  background: transparent;
  border-color: hsl(var(--border) / 0.18) !important;
}

.planner-calendar :deep(.planner-day-cell-today) {
  background: hsl(var(--primary) / 0.02);
}

.planner-calendar :deep(.planner-day-cell-weekend:not(.planner-day-cell-today)) {
  background: hsl(var(--muted) / 0.02);
}

.planner-calendar :deep(.planner-day-cell a) {
  padding: 0.4rem 0.5rem;
  color: hsl(var(--muted-foreground));
  font-size: 0.75rem;
  font-weight: 550;
  text-decoration: none;
}

.planner-calendar :deep(.planner-now-line) {
  border-color: hsl(var(--destructive) / 0.72) !important;
  border-width: 1px 0 0 !important;
}

.planner-calendar :deep(.planner-now-dot) {
  border-color: hsl(var(--destructive) / 0.72) !important;
  background: hsl(var(--destructive) / 0.72) !important;
}

/* FullCalendar portals Month overflow events outside the calendar ancestor. */
:global(.planner-source) {
  --planner-event-hsl: var(--planner-source-hsl);
  --planner-event-foreground-hsl: var(--planner-source-foreground-hsl);
  margin: 1px 2px;
  overflow: hidden;
  border: 1px solid hsl(var(--planner-event-hsl) / 0.48) !important;
  border-radius: 0.42rem;
  cursor: pointer;
  color: hsl(var(--planner-event-foreground-hsl)) !important;
  background: linear-gradient(
    180deg,
    hsl(var(--planner-event-hsl) / 0.92),
    hsl(var(--planner-event-hsl) / 0.8)
  ) !important;
  box-shadow:
    0 1px 2px hsl(0 0% 0% / 0.16),
    inset 0 1px 0 hsl(0 0% 100% / 0.12);
  transition:
    filter 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;
}

:global(.planner-source:hover) {
  filter: saturate(1.06) brightness(1.06);
  box-shadow:
    0 2px 6px hsl(0 0% 0% / 0.2),
    inset 0 1px 0 hsl(0 0% 100% / 0.14);
}

:global(.planner-source:focus-visible) {
  outline: none;
  box-shadow:
    0 0 0 2px hsl(var(--background)),
    0 0 0 4px hsl(var(--planner-event-hsl) / 0.72);
}

:global(.planner-event) {
  padding: 0.3rem 0.42rem 0.25rem 0.48rem;
  color: inherit;
  font-size: 0.75rem;
  line-height: 1.18;
}

:global(.planner-event-title) {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  font-weight: 650;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: normal;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

:global(.planner-event-conflict-icon) {
  width: 0.75rem;
  height: 0.75rem;
  margin-top: 0.0625rem;
}

.planner-calendar :deep(.planner-selection-preview) {
  pointer-events: none;
  border: 1px dashed hsl(var(--primary) / 0.72);
  border-radius: 0.42rem;
  background: hsl(var(--primary) / 0.1);
  box-shadow: inset 0 0 0 1px hsl(var(--primary) / 0.05);
}

:global(.planner-event-all-day) {
  min-height: 1.5rem;
  border-color: hsl(var(--planner-event-hsl) / 0.3) !important;
  color: hsl(var(--planner-event-hsl)) !important;
  background: hsl(var(--planner-event-hsl) / 0.13) !important;
  box-shadow: inset 2px 0 0 hsl(var(--planner-event-hsl) / 0.72);
}

:global(.planner-occupancy-marker) {
  border-style: dashed !important;
  border-color: hsl(var(--planner-event-hsl) / 0.66) !important;
  color: hsl(var(--planner-event-hsl)) !important;
  background: hsl(var(--planner-event-hsl) / 0.09) !important;
  box-shadow: none;
}

:global(.planner-tone-muted) {
  --planner-event-hsl: var(--muted-foreground);
  --planner-event-foreground-hsl: var(--foreground);
  opacity: 0.72;
}

:global(.planner-tone-success) {
  --planner-event-hsl: var(--success);
  --planner-event-foreground-hsl: var(--success-foreground);
}

:global(.planner-event-conflict),
:global(.planner-tone-warning) {
  --planner-event-hsl: var(--warning);
  --planner-event-foreground-hsl: var(--warning-foreground);
}

.planner-calendar :deep(.planner-more-link) {
  color: hsl(var(--primary)) !important;
  font-size: 0.6875rem;
  font-weight: 600;
}
</style>
