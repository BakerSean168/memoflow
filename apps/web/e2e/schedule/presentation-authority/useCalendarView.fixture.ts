import { ref } from 'vue';
import type { PlannerProjectionSource } from '@memoflow/app-vue/modules/schedule/planner/planner-presentation';
import { plannerProjectionSourceLabel } from '@memoflow/app-vue/modules/schedule/planner/planner-presentation';
import { getProductTime, productTimeRevision } from '@memoflow/app-vue/shared/utils/product-time';

export interface CalendarEventItem {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  displayMode: 'timed' | 'all-day';
  source: PlannerProjectionSource;
  originalId: string;
}

export interface ScheduleCapsuleSnapshot {
  kind: 'empty' | 'current' | 'upcoming';
  event: CalendarEventItem | null;
  minutesUntilStart: number | null;
}

export function toLocalDateKey(value: Date | number): string {
  void productTimeRevision.value;
  const instant = typeof value === 'number' ? value : value.getTime();
  return String(getProductTime().calendar.toYmd(instant));
}

export function formatCapsuleTime(ms: number): string {
  void productTimeRevision.value;
  return getProductTime().format.hm(ms);
}

export function calendarEventSourceLabel(
  source: PlannerProjectionSource,
  translate: (key: string) => string,
): string {
  return plannerProjectionSourceLabel(source, translate);
}

const capsuleEvents = ref<CalendarEventItem[]>([
  {
    id: 'schedule-entry-1',
    title: 'Deep work / 深度工作',
    startTime: Date.parse('2026-10-01T09:00:00Z'),
    endTime: Date.parse('2026-10-01T10:00:00Z'),
    displayMode: 'timed',
    source: 'schedule',
    originalId: 'entry-1',
  },
  {
    id: 'task-occurrence-1',
    title: 'Review task / 复盘任务',
    startTime: Date.parse('2026-10-01T10:30:00Z'),
    endTime: Date.parse('2026-10-01T11:00:00Z'),
    displayMode: 'timed',
    source: 'task',
    originalId: 'task-occurrence-1',
  },
  {
    id: 'goal-target-1',
    title: 'Goal target / 目标节点',
    startTime: Date.parse('2026-10-01T11:30:00Z'),
    endTime: Date.parse('2026-10-01T12:00:00Z'),
    displayMode: 'timed',
    source: 'goal',
    originalId: 'goal-1',
  },
  {
    id: 'routine-occurrence-1',
    title: 'Routine / 例行',
    startTime: Date.parse('2026-10-01T12:30:00Z'),
    endTime: Date.parse('2026-10-01T13:00:00Z'),
    displayMode: 'timed',
    source: 'routine',
    originalId: 'routine-1',
  },
]);

function resolveScheduleCapsule(
  events: CalendarEventItem[],
  nowMs: number = Date.now(),
): ScheduleCapsuleSnapshot {
  const todayKey = toLocalDateKey(nowMs);
  const todays = events
    .filter(
      (event) =>
        toLocalDateKey(event.startTime) === todayKey || toLocalDateKey(event.endTime) === todayKey,
    )
    .sort((a, b) => a.startTime - b.startTime);
  const current = todays.find(
    (event) => event.displayMode === 'timed' && event.startTime <= nowMs && event.endTime > nowMs,
  );
  if (current) return { kind: 'current', event: current, minutesUntilStart: null };
  const upcoming = todays.find((event) => event.startTime > nowMs);
  if (upcoming) {
    return {
      kind: 'upcoming',
      event: upcoming,
      minutesUntilStart: Math.max(0, Math.round((upcoming.startTime - nowMs) / 60_000)),
    };
  }
  return { kind: 'empty', event: null, minutesUntilStart: null };
}

export function useCalendarView() {
  return {
    capsuleEvents,
    async ensureTodayLoaded() {},
    getScheduleCapsuleSnapshot(nowMs: number = Date.now()) {
      return resolveScheduleCapsule(capsuleEvents.value, nowMs);
    },
  };
}
