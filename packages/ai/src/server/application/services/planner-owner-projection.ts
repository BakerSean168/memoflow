import type {
  CalendarEntryClientDTO,
  ScheduleCalendarEventProjection,
  TaskCalendarEventProjection,
} from '@memoflow/contracts/schedule';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import type { Instant, Ymd } from '@memoflow/time';

export interface PlannerProductTimePort {
  combine(date: Ymd, hm: string): Instant | null;
}

export function projectPlannerCalendarEntry(
  entry: CalendarEntryClientDTO,
): ScheduleCalendarEventProjection {
  const range = entry.range;
  const shared = {
    identityId: String(entry.identityId),
    sourceType: 'schedule' as const,
    sourceId: String(entry.id),
    title: entry.title,
    occupancy: range.kind === 'Timed' ? ('blocking' as const) : ('non-blocking' as const),
    displayMetadata: {
      semantic: 'calendar-entry' as const,
      subtitle: entry.location ?? null,
      tone: 'accent' as const,
    },
    editableCapabilities: { move: true, resize: true },
    ownerCommandTarget: {
      ownerType: 'schedule.calendar-entry' as const,
      ownerId: String(entry.id),
    },
    revision: entry.version,
  };

  return range.kind === 'Timed'
    ? { ...shared, allDay: false, start: range.start, end: range.end }
    : { ...shared, allDay: true, start: range.start, end: range.end };
}

function taskResultSubtitle(result: TaskOccurrenceClientDTO['result']): string | null {
  if (result == null) return null;
  return result.kind === 'Completed' ? result.note : result.reason;
}

function requireTaskWallClockInstant(
  occurrence: TaskOccurrenceClientDTO,
  time: PlannerProductTimePort,
  hm: string,
): Instant {
  const resolved = time.combine(occurrence.scheduleSnapshot.date, hm);
  if (resolved == null) {
    throw new TypeError(
      `Task occurrence '${occurrence.id}' wall-clock time '${occurrence.scheduleSnapshot.date} ${hm}' does not resolve`,
    );
  }
  return resolved;
}

export function projectPlannerTaskOccurrence(
  occurrence: TaskOccurrenceClientDTO,
  ownerPlan: TaskPlanClientDTO | undefined,
  time: PlannerProductTimePort,
): TaskCalendarEventProjection | null {
  if (occurrence.deletedAt != null) return null;

  const timing = occurrence.scheduleSnapshot.timing;
  const editable = occurrence.status === 'Pending' || occurrence.status === 'InProgress';
  const base = {
    identityId: String(occurrence.identityId),
    sourceType: 'task' as const,
    sourceId: String(occurrence.id),
    title: ownerPlan?.name ?? String(occurrence.id),
    occupancy:
      timing.kind === 'Window'
        ? ('blocking' as const)
        : timing.kind === 'AllDay'
          ? ('non-blocking' as const)
          : ('marker' as const),
    displayMetadata: {
      semantic: 'task-occurrence' as const,
      subtitle: taskResultSubtitle(occurrence.result),
      tone: occurrence.isOverdue ? ('warning' as const) : ('default' as const),
      status: occurrence.status,
    },
    editableCapabilities: { move: editable, resize: false },
    ownerCommandTarget: {
      ownerType: 'task.occurrence' as const,
      ownerId: String(occurrence.id),
    },
    revision: occurrence.version,
  };

  if (timing.kind === 'AllDay') {
    return { ...base, allDay: true, start: occurrence.scheduleSnapshot.date, end: null };
  }

  if (timing.kind === 'At') {
    return {
      ...base,
      allDay: false,
      start: requireTaskWallClockInstant(occurrence, time, timing.time),
      end: null,
    };
  }

  return {
    ...base,
    allDay: false,
    start: requireTaskWallClockInstant(occurrence, time, timing.start),
    end: requireTaskWallClockInstant(occurrence, time, timing.end),
  };
}
