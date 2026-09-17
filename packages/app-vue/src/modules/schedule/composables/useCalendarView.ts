/**
 * useCalendarView - 日历视图聚合 composable
 *
 * 将 CalendarEntry（schedule 模块）、Goal 和 TaskOccurrence 三个来源
 * 统一转换为内部 CalendarEventItem 类型后提供给日历组件渲染。
 */

import { computed, ref } from 'vue';
import { useSchedule } from './useSchedule';
import { useTask } from '../../task/composables/useTask';
import { GOAL_SERVICE_KEY, REMINDER_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import type {
  TaskOccurrenceClientDTO,
  TaskOccurrenceStatus,
  TaskPlanClientDTO,
} from '@memoflow/contracts/task';
import type { CalendarEventProjection } from '@memoflow/contracts/schedule';
import { derivePlannerConflicts, plannerConflictSourceKeys, plannerProjectionKey } from '@memoflow/schedule/client';
import { asInstant } from '@memoflow/time';
import {
  endOfDayMs,
  getProductTime,
  productTimeRevision,
  startOfDayMs,
} from '../../../shared/utils/product-time';
import {
  projectPlannerReadModel,
  projectTaskOccurrence,
  type PlannerProductTimePort,
} from '../planner';

// ============ 统一内部事件类型 ============

export interface CalendarEventItem {
  id: string;
  title: string;
  startTime: number; // ms timestamp
  endTime: number; // ms timestamp
  displayMode: 'timed' | 'all-day';
  source: 'schedule' | 'task' | 'goal';
  hasConflict?: boolean;
  originalId: string;
  /** 仅当 source === 'task' 时存在，对应 TaskOccurrenceStatus 值 */
  instanceStatus?: TaskOccurrenceStatus;
}

/**
 * Residual 1282: sole toLocalDateKey — Date | number → YYYY-MM-DD local calendar key.
 * Dual-retired from Day/Week/Month calendar local toDateStr copies.
 * Residual 1321: padStart dual retired onto padTwoDigits sole (Date|number key contract stays local).
 * TIME-1206: date keys are canonical session-calendar Ymd values, not Date-derived storage encodings.
 */
export function toLocalDateKey(value: Date | number): string {
  void productTimeRevision.value;
  const instant = typeof value === 'number' ? value : value.getTime();
  return String(getProductTime().calendar.toYmd(instant));
}

/**
 * Residual 1291: sole calendarEventSourceLabel — schedule/goal/task source → i18n label.
 * Dual-retired from DayDetailSheet + EventDetailSheet local sourceLabel copies.
 * TIME-1206: capsule HH:mm formatting resolves through the session Product Time facade.
 * Soft residual 1288: Month eventClass translucent + getEventStyle Day/Week layout keep-boundaries remain separate.
 */
export function calendarEventSourceLabel(
  source: CalendarEventItem['source'],
  translate: (key: string) => string,
): string {
  const keys: Record<CalendarEventItem['source'], string> = {
    schedule: 'schedule.source.schedule',
    goal: 'schedule.source.goal',
    task: 'schedule.source.task',
  };
  return translate(keys[source]);
}

/**
 * TIME-1206: formatCapsuleTime is a thin session Product Time presentation helper.
 * Thin schedule alias for shell capsule consumers (same HH:mm local padStart contract).
 */
export function formatCapsuleTime(ms: number): string {
  void productTimeRevision.value;
  return getProductTime().format.hm(ms);
}

export type ScheduleCapsuleSnapshot = {
  kind: 'empty' | 'current' | 'upcoming';
  event: CalendarEventItem | null;
  /** Minutes until start (upcoming only). */
  minutesUntilStart: number | null;
};

/**
 * Pick the "current / next" event for the header schedule capsule (V2 §2).
 * Prefers an in-progress timed event; otherwise the next upcoming event today.
 */
export function resolveScheduleCapsule(
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
  if (current) {
    return { kind: 'current', event: current, minutesUntilStart: null };
  }

  const upcoming = todays.find((event) => event.startTime > nowMs);
  if (upcoming) {
    const minutesUntilStart = Math.max(0, Math.round((upcoming.startTime - nowMs) / 60000));
    return { kind: 'upcoming', event: upcoming, minutesUntilStart };
  }

  // All-day only (or nothing timed left) still counts as "has schedule" when present.
  const allDay = todays.find((event) => event.displayMode === 'all-day');
  if (allDay) {
    return { kind: 'current', event: allDay, minutesUntilStart: null };
  }

  return { kind: 'empty', event: null, minutesUntilStart: null };
}

export function formatScheduleCapsuleLabel(
  snapshot: ScheduleCapsuleSnapshot,
  t: (key: string, params?: Record<string, unknown>) => string,
): string | null {
  if (snapshot.kind === 'empty' || !snapshot.event) return null;
  const event = snapshot.event;
  if (snapshot.kind === 'current') {
    if (event.displayMode === 'all-day') {
      return t('shell.schedule.currentAllDay', { title: event.title });
    }
    return t('shell.schedule.current', {
      start: formatCapsuleTime(event.startTime),
      end: formatCapsuleTime(event.endTime),
      title: event.title,
    });
  }
  return t('shell.schedule.upcoming', {
    start: formatCapsuleTime(event.startTime),
    title: event.title,
    minutes: snapshot.minutesUntilStart ?? 0,
  });
}

// ============ 转换工具函数 ============

/** Product-time seam shared by the canonical Planner projection and the legacy renderer adapter. */
function plannerProductTimePort(): PlannerProductTimePort {
  const time = getProductTime();
  return {
    combine: (date, hm) => time.input.combine(date, hm),
  };
}

/**
 * Temporary renderer compatibility seam until PLAN-4304 retires the custom
 * Day/Week/Month layout. Canonical ownership/revision/time truth stays on the
 * CalendarEventProjection; this only reshapes Schedule/Task facts for old UI.
 */
function projectionToLegacyCalendarEvent(
  projection: Extract<CalendarEventProjection, { sourceType: 'schedule' | 'task' }>,
  conflictingSourceKeys: ReadonlySet<string> = new Set(),
): CalendarEventItem {
  const time = getProductTime();
  const startTime = projection.allDay
    ? Number(time.codec.startOfYmd(projection.start))
    : Number(projection.start);
  const endTime = projection.allDay
    ? Number(time.calendar.endOfDay(startTime))
    : Number(projection.end ?? startTime + 30 * 60_000);

  return {
    id: `${projection.sourceType}-${projection.sourceId}`,
    title: projection.title,
    startTime,
    endTime,
    displayMode: projection.allDay ? 'all-day' : 'timed',
    source: projection.sourceType,
    hasConflict: conflictingSourceKeys.has(plannerProjectionKey(projection)),
    originalId: projection.ownerCommandTarget.ownerId,
    instanceStatus:
      projection.sourceType === 'task'
        ? (projection.displayMetadata.status as TaskOccurrenceStatus | undefined)
        : undefined,
  };
}

/** TaskOccurrence → legacy CalendarEventItem through the canonical PLAN-4302 projection. */
export function taskOccurrencesToEvents(
  instances: TaskOccurrenceClientDTO[],
  templates: TaskPlanClientDTO[],
): CalendarEventItem[] {
  const templateMap = new Map(templates.map((template) => [String(template.id), template]));
  const time = plannerProductTimePort();
  return instances.flatMap((instance) => {
    const projection = projectTaskOccurrence(
      instance,
      templateMap.get(String(instance.planId)),
      time,
    );
    return projection ? [projectionToLegacyCalendarEvent(projection)] : [];
  });
}

// ============ Composable ============

export function useCalendarView() {
  const schedule = useSchedule();
  const task = useTask();
  const goalService = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
  const reminderService = useStrictInject(REMINDER_SERVICE_KEY, 'ReminderService');
  const plannerGoals = ref<Parameters<typeof projectPlannerReadModel>[0]['goals']>([]);
  const plannerRoutineOccurrences = ref<Parameters<typeof projectPlannerReadModel>[0]['routineOccurrences']>([]);
  const plannerOwnerReadsLoading = ref(false);

  /** Currently displayed time window (set when calendar navigation changes) */
  const windowStart = ref<number>(0);
  const windowEnd = ref<number>(0);

  /**
   * Canonical owner-aware Planner read model. CalendarEntry, TaskOccurrence,
   * Goal dates and the current Routine occurrence marker feed are composed here;
   * raw Scheduler invocation persistence never enters this value. R4-2201B may
   * later replace the Routine marker source without changing Planner semantics.
   */
  const projections = computed<CalendarEventProjection[]>(() => {
    const entriesRaw = schedule.calendarEntries.value;
    const instancesRaw = task.instances.value;
    const templatesRaw = task.templates.value;
    return projectPlannerReadModel({
      calendarEntries: Array.isArray(entriesRaw) ? entriesRaw : [],
      taskOccurrences: Array.isArray(instancesRaw) ? instancesRaw : [],
      taskPlans: Array.isArray(templatesRaw) ? templatesRaw : [],
      goals: plannerGoals.value,
      routineOccurrences: plannerRoutineOccurrences.value,
      time: plannerProductTimePort(),
    });
  });

  /** Pure cross-owner conflict read model. No owner projection stores conflict truth. */
  const conflicts = computed(() => derivePlannerConflicts(projections.value));
  const conflictingSourceKeys = computed(() => plannerConflictSourceKeys(conflicts.value));

  /** Legacy custom-calendar view model, derived from canonical Schedule/Task projections. */
  const events = computed<CalendarEventItem[]>(() =>
    projections.value
      .filter(
        (event): event is Extract<CalendarEventProjection, { sourceType: 'schedule' | 'task' }> =>
          event.sourceType === 'schedule' || event.sourceType === 'task',
      )
      .map((projection) => projectionToLegacyCalendarEvent(projection, conflictingSourceKeys.value))
      .sort((a, b) => a.startTime - b.startTime),
  );

  const isLoading = computed(
    () => schedule.isLoading.value || task.isLoading.value || plannerOwnerReadsLoading.value,
  );

  async function fetchPlannerOwnerMarkers(startTime: number, endTime: number) {
    plannerOwnerReadsLoading.value = true;
    try {
      const [goalResult, reminderResult] = await Promise.all([
        goalService.listGoals({ systemView: 'all', page: 1, pageSize: 500 }),
        reminderService.getReminderTemplates(),
      ]);

      plannerGoals.value = goalResult.ok
        ? goalResult.data.goals.map((goal) => goal.toDTO())
        : [];
      plannerRoutineOccurrences.value = reminderResult.ok
        ? reminderResult.data.templates.flatMap((routine) => {
            if (!routine.effectiveEnabled || routine.nextTriggerAt == null) return [];
            if (routine.nextTriggerAt < startTime || routine.nextTriggerAt > endTime) return [];
            return [
              {
                identityId: String(routine.identityId),
                routineId: String(routine.id),
                occurrenceKey: `routine:${String(routine.id)}:oc:${routine.nextTriggerAt}`,
                title: routine.name,
                subtitle: routine.description,
                occurrenceAt: asInstant(routine.nextTriggerAt),
                endAt: null,
                revision: routine.version,
                editable: false,
              },
            ];
          })
        : [];
    } finally {
      plannerOwnerReadsLoading.value = false;
    }
  }

  /** Fetch all owner facts for the given Planner time window. */
  async function fetchForRange(startTime: number, endTime: number) {
    windowStart.value = startTime;
    windowEnd.value = endTime;

    await Promise.all([
      schedule.fetchCalendarEntries(startTime, endTime),
      task.fetchInstancesByDateRange(startTime, endTime),
      task.fetchTemplates(),
      fetchPlannerOwnerMarkers(startTime, endTime),
    ]);
  }

  /** Ensure today's events are loaded (shell capsule). */
  async function ensureTodayLoaded(nowMs: number = Date.now()) {
    const start = startOfDayMs(nowMs);
    const end = endOfDayMs(nowMs);
    // Avoid refetch thrash if window already covers today.
    if (windowStart.value <= start && windowEnd.value >= end && windowEnd.value > 0) {
      return;
    }
    await fetchForRange(start, end);
  }

  function getScheduleCapsuleSnapshot(nowMs: number = Date.now()): ScheduleCapsuleSnapshot {
    return resolveScheduleCapsule(events.value, nowMs);
  }

  return {
    projections,
    conflicts,
    events,
    isLoading,
    windowStart,
    windowEnd,
    fetchForRange,
    ensureTodayLoaded,
    getScheduleCapsuleSnapshot,
  };
}
