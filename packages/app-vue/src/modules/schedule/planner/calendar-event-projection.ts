import { goalTimeframeEndBoundary, type GoalClientDTO } from '@memoflow/contracts/goal';
import type {
  CalendarEntryClientDTO,
  CalendarEventProjection,
  GoalCalendarEventProjection,
  RoutineCalendarEventProjection,
  ScheduleCalendarEventProjection,
  TaskCalendarEventProjection,
} from '@memoflow/contracts/schedule';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import { asInstant, type Instant, type Ymd } from '@memoflow/time';
import { getProductTime } from '../../../shared/utils/product-time';

export interface PlannerProductTimePort {
  combine(date: Ymd, hm: string): Instant | null;
}

export const defaultPlannerProductTimePort: PlannerProductTimePort = {
  combine: (date, hm) => getProductTime().input.combine(date, hm) as Instant | null,
};

export interface RoutineWallClockPlannerOccurrence {
  readonly identityId: string;
  readonly routineId: string;
  /** Canonical Routine occurrence identity, e.g. routine:<id>:oc:<instant>. */
  readonly occurrenceKey: string;
  readonly title: string;
  readonly occurrenceAt: Instant;
  readonly endAt?: Instant | null;
  readonly revision: number;
  readonly editable?: boolean;
  readonly subtitle?: string | null;
}

export interface PlannerReadProjectionInput {
  readonly calendarEntries: readonly CalendarEntryClientDTO[];
  readonly taskOccurrences: readonly TaskOccurrenceClientDTO[];
  readonly taskPlans: readonly TaskPlanClientDTO[];
  readonly goals: readonly GoalClientDTO[];
  readonly routineOccurrences: readonly RoutineWallClockPlannerOccurrence[];
  readonly time?: PlannerProductTimePort;
}

export function projectCalendarEntry(
  entry: CalendarEntryClientDTO,
): ScheduleCalendarEventProjection {
  return {
    identityId: String(entry.identityId),
    sourceType: 'schedule',
    sourceId: String(entry.id),
    start: asInstant(Number(entry.startTime)),
    end: asInstant(Number(entry.endTime)),
    allDay: false,
    title: entry.title,
    displayMetadata: {
      semantic: 'calendar-entry',
      subtitle: entry.location ?? null,
      tone: entry.hasConflict ? 'warning' : 'accent',
      hasConflict: entry.hasConflict,
    },
    editableCapabilities: { move: true, resize: true },
    ownerCommandTarget: {
      ownerType: 'schedule.calendar-entry',
      ownerId: String(entry.id),
    },
    revision: entry.version,
  };
}

function taskResultSubtitle(result: TaskOccurrenceClientDTO['result']): string | null {
  if (result == null) return null;
  return result.kind === 'Completed' ? (result.note ?? null) : (result.reason ?? null);
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

export function projectTaskOccurrence(
  occurrence: TaskOccurrenceClientDTO,
  template: TaskPlanClientDTO | undefined,
  time: PlannerProductTimePort = defaultPlannerProductTimePort,
): TaskCalendarEventProjection | null {
  if (occurrence.deletedAt != null) return null;

  const editable = occurrence.status === 'Pending' || occurrence.status === 'InProgress';
  const timing = occurrence.scheduleSnapshot.timing;
  const base = {
    identityId: String(occurrence.identityId),
    sourceType: 'task' as const,
    sourceId: String(occurrence.id),
    title: template?.name ?? String(occurrence.id),
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
    return {
      ...base,
      allDay: true,
      start: occurrence.scheduleSnapshot.date,
      end: null,
    };
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

export function projectGoalDates(
  goal: GoalClientDTO,
  _time: PlannerProductTimePort = defaultPlannerProductTimePort,
): GoalCalendarEventProjection[] {
  if (goal.deletedAt != null) return [];

  const editable =
    (goal.status === 'Planned' || goal.status === 'InProgress') && goal.archivedAt == null;
  const base = {
    identityId: String(goal.identityId),
    sourceType: 'goal' as const,
    title: goal.name,
    editableCapabilities: { move: editable, resize: false },
    ownerCommandTarget: { ownerType: 'goal.goal' as const, ownerId: String(goal.id) },
    revision: goal.version,
  };
  const events: GoalCalendarEventProjection[] = [];

  if (goal.startDate != null) {
    events.push({
      ...base,
      sourceId: `${String(goal.id)}:start-date`,
      allDay: true,
      start: goal.startDate,
      end: null,
      displayMetadata: {
        semantic: 'goal-start',
        subtitle: null,
        tone: 'muted',
        status: goal.status,
      },
    });
  }

  if (goal.target != null) {
    const targetEditable = editable && goal.target.kind === 'day';
    events.push({
      ...base,
      sourceId: `${String(goal.id)}:target`,
      allDay: true,
      start: goalTimeframeEndBoundary(goal.target),
      end: null,
      editableCapabilities: { move: targetEditable, resize: false },
      displayMetadata: {
        semantic: 'goal-target',
        subtitle: null,
        tone: targetEditable ? 'default' : 'muted',
        status: goal.status,
      },
    });
  }

  return events;
}

export function projectRoutineWallClockOccurrence(
  occurrence: RoutineWallClockPlannerOccurrence,
): RoutineCalendarEventProjection {
  return {
    identityId: occurrence.identityId,
    sourceType: 'routine',
    sourceId: occurrence.occurrenceKey,
    start: occurrence.occurrenceAt,
    end: occurrence.endAt ?? null,
    allDay: false,
    title: occurrence.title,
    displayMetadata: {
      semantic: 'routine-wall-clock',
      subtitle: occurrence.subtitle ?? null,
      tone: 'default',
    },
    editableCapabilities: { move: occurrence.editable ?? false, resize: false },
    ownerCommandTarget: {
      ownerType: 'routine.routine',
      ownerId: occurrence.routineId,
    },
    revision: occurrence.revision,
  };
}

/**
 * Owner-aware Planner read aggregation. Deliberately accepts owner read facts
 * only; raw Scheduler invocation rows are not a legal input to this boundary.
 */
export function projectPlannerReadModel(
  input: PlannerReadProjectionInput,
): CalendarEventProjection[] {
  const time = input.time ?? defaultPlannerProductTimePort;
  const templateById = new Map(input.taskPlans.map((template) => [String(template.id), template]));
  const projected: CalendarEventProjection[] = [
    ...input.calendarEntries.map(projectCalendarEntry),
    ...input.taskOccurrences.flatMap((occurrence) => {
      const event = projectTaskOccurrence(
        occurrence,
        templateById.get(String(occurrence.planId)),
        time,
      );
      return event ? [event] : [];
    }),
    ...input.goals.flatMap((goal) => projectGoalDates(goal, time)),
    ...input.routineOccurrences.map(projectRoutineWallClockOccurrence),
  ];

  const seen = new Set<string>();
  for (const event of projected) {
    const key = `${event.sourceType}:${event.sourceId}`;
    if (seen.has(key)) throw new TypeError(`Duplicate Planner source identity '${key}'`);
    seen.add(key);
  }
  return projected;
}
