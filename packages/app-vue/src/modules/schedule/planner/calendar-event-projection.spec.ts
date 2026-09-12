import { describe, expect, expectTypeOf, it } from 'vitest';
import type { GoalClientDTO } from '@memoflow/contracts/goal';
import type { CalendarEntryClientDTO, CalendarEventProjection } from '@memoflow/contracts/schedule';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import { asInstant, asYmd, type Instant, type Ymd } from '@memoflow/time';
import {
  projectCalendarEntry,
  projectGoalDates,
  projectPlannerReadModel,
  projectRoutineWallClockOccurrence,
  projectTaskOccurrence,
  type PlannerProductTimePort,
  type RoutineWallClockPlannerOccurrence,
} from './calendar-event-projection';

const dayStart = asInstant(Date.parse('2026-08-27T00:00:00.000Z'));
const taskDay = asInstant(Date.parse('2026-08-28T00:00:00.000Z'));
const goalStart = asYmd('2026-09-01');
const goalTarget = asYmd('2026-09-30');

const time: PlannerProductTimePort = {
  startOfDay: (instant) => instant,
  toYmd: (instant) => {
    if (instant === taskDay) return asYmd('2026-08-28');
    throw new Error(`Unexpected Instant ${instant}`);
  },
};

function calendarEntry(): CalendarEntryClientDTO {
  return {
    id: 'schedule-1',
    identityId: 'identity-1',
    title: 'Deep work',
    description: 'Protected focus block',
    startTime: Number(dayStart) + 9 * 60 * 60_000,
    endTime: Number(dayStart) + 10 * 60 * 60_000,
    duration: 60,
    hasConflict: true,
    conflictingEntries: ['schedule-2'],
    version: 7,
    createdAt: Number(dayStart),
    updatedAt: Number(dayStart),
  } as CalendarEntryClientDTO;
}

function taskOccurrence(overrides: Partial<TaskOccurrenceClientDTO> = {}): TaskOccurrenceClientDTO {
  return {
    id: 'task-occurrence-1',
    templateId: 'task-plan-1',
    identityId: 'identity-1',
    instanceDate: Number(taskDay),
    timeConfig: {
      timeType: 'AllDay',
      startDate: Number(taskDay),
      timePoint: null,
      timeRange: null,
    },
    status: 'Pending',
    isOverdue: false,
    actualStartTime: null,
    actualEndTime: null,
    comment: null,
    version: 3,
    createdAt: Number(taskDay),
    updatedAt: Number(taskDay),
    deletedAt: null,
    ...overrides,
  } as TaskOccurrenceClientDTO;
}

const taskPlan = {
  id: 'task-plan-1',
  name: 'Review Core vNext PR',
} as TaskPlanClientDTO;

function goal(overrides: Partial<GoalClientDTO> = {}): GoalClientDTO {
  return {
    id: 'goal-1',
    identityId: 'identity-1',
    name: 'Ship Core vNext',
    summary: null,
    status: 'InProgress',
    startDate: goalStart,
    target: { kind: 'day', date: goalTarget },
    completedAt: null,
    archivedAt: null,
    sortOrder: 0,
    reminderConfig: null,
    labels: [],
    createdAt: Number(dayStart),
    updatedAt: Number(dayStart),
    deletedAt: null,
    version: 12,
    keyResults: null,
    reviews: null,
    totalKeyResults: 0,
    completedKeyResults: 0,
    overallProgress: 0,
    ...overrides,
  } as GoalClientDTO;
}

const routineOccurrence: RoutineWallClockPlannerOccurrence = {
  identityId: 'identity-1',
  routineId: 'routine-1',
  occurrenceKey: 'routine:routine-1:oc:1788130800000',
  title: 'Evening wind-down',
  occurrenceAt: asInstant(Date.parse('2026-08-30T22:00:00.000Z')),
  endAt: null,
  revision: 4,
};

describe('CalendarEventProjection (PLAN-4302)', () => {
  it('projects a manual CalendarEntry as an owner-aware timed Product Time fact', () => {
    const event = projectCalendarEntry(calendarEntry());

    expect(event).toMatchObject({
      identityId: 'identity-1',
      sourceType: 'schedule',
      sourceId: 'schedule-1',
      allDay: false,
      editableCapabilities: { move: true, resize: true },
      ownerCommandTarget: { ownerType: 'schedule.calendar-entry', ownerId: 'schedule-1' },
      revision: 7,
      displayMetadata: { semantic: 'calendar-entry', hasConflict: true },
    });
    if (event.allDay) throw new Error('CalendarEntry must be timed');
    expectTypeOf(event.start).toEqualTypeOf<Instant>();
    expectTypeOf(event.end).toEqualTypeOf<Instant | null>();
  });

  it('projects TaskOccurrence time semantics without leaking Date or Scheduler types', () => {
    const allDay = projectTaskOccurrence(taskOccurrence(), taskPlan, time)!;
    expect(allDay).toMatchObject({
      sourceType: 'task',
      sourceId: 'task-occurrence-1',
      title: 'Review Core vNext PR',
      allDay: true,
      start: '2026-08-28',
      editableCapabilities: { move: true, resize: false },
      ownerCommandTarget: { ownerType: 'task.instance', ownerId: 'task-occurrence-1' },
    });
    if (!allDay.allDay) throw new Error('Expected all-day task');
    expectTypeOf(allDay.start).toEqualTypeOf<Ymd>();

    const timed = projectTaskOccurrence(
      taskOccurrence({
        timeConfig: {
          timeType: 'TimeRange',
          startDate: Number(taskDay),
          timePoint: null,
          timeRange: { start: 14 * 60, end: 15 * 60 + 30 },
        },
      }),
      taskPlan,
      time,
    )!;
    if (timed.allDay) throw new Error('Expected timed task');
    expect(timed.start).toBe(Number(taskDay) + 14 * 60 * 60_000);
    expect(timed.end).toBe(Number(taskDay) + (15 * 60 + 30) * 60_000);
  });

  it('projects Goal start/target as distinct all-day facts targeting the Goal owner', () => {
    const events = projectGoalDates(goal(), time);
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.sourceId)).toEqual(['goal-1:start-date', 'goal-1:target']);
    expect(events[1]).toMatchObject({
      allDay: true,
      start: '2026-09-30',
      displayMetadata: { semantic: 'goal-target' },
      ownerCommandTarget: { ownerType: 'goal.goal', ownerId: 'goal-1' },
      editableCapabilities: { move: true, resize: false },
      revision: 12,
    });
    const target = events[1]!;
    if (!target.allDay) throw new Error('Goal target must be all-day');
    expectTypeOf(target.start).toEqualTypeOf<Ymd>();
  });

  it('projects a coarse Target Timeframe at its end boundary but keeps it read-only', () => {
    const events = projectGoalDates(
      goal({ target: { kind: 'quarter', year: 2026, quarter: 4 } }),
      time,
    );
    expect(events[1]).toMatchObject({
      sourceId: 'goal-1:target',
      start: '2026-12-31',
      editableCapabilities: { move: false, resize: false },
      displayMetadata: { semantic: 'goal-target', tone: 'muted' },
    });
  });

  it('keeps non-terminal Goal dates editable without turning lifecycle into calendar state', () => {
    expect(projectGoalDates(goal({ status: 'Planned' }), time)[0]?.editableCapabilities.move).toBe(
      true,
    );
    expect(
      projectGoalDates(goal({ status: 'InProgress' }), time)[0]?.editableCapabilities.move,
    ).toBe(true);
    expect(
      projectGoalDates(goal({ status: 'Completed' }), time)[0]?.editableCapabilities.move,
    ).toBe(false);
    expect(
      projectGoalDates(goal({ status: 'Abandoned' }), time)[0]?.editableCapabilities.move,
    ).toBe(false);
    expect(
      projectGoalDates(goal({ status: 'InProgress', archivedAt: Number(dayStart) }), time)[0]
        ?.editableCapabilities.move,
    ).toBe(false);
  });

  it('projects Routine wall-clock occurrence identity, not its Scheduler invocation identity', () => {
    const event = projectRoutineWallClockOccurrence(routineOccurrence);
    expect(event).toMatchObject({
      sourceType: 'routine',
      sourceId: routineOccurrence.occurrenceKey,
      allDay: false,
      ownerCommandTarget: { ownerType: 'routine.routine', ownerId: 'routine-1' },
      editableCapabilities: { move: false, resize: false },
      displayMetadata: { semantic: 'routine-wall-clock' },
    });
    if (event.allDay) throw new Error('Routine wall-clock occurrence must be timed');
    expectTypeOf(event.start).toEqualTypeOf<Instant>();
  });

  it('aggregates all owner facts and rejects duplicate source identities', () => {
    const input = {
      calendarEntries: [calendarEntry()],
      taskOccurrences: [taskOccurrence()],
      taskPlans: [taskPlan],
      goals: [goal()],
      routineOccurrences: [routineOccurrence],
      time,
    };
    const events = projectPlannerReadModel(input);
    expect(events.map((event) => event.sourceType)).toEqual([
      'schedule',
      'task',
      'goal',
      'goal',
      'routine',
    ]);
    expectTypeOf(events).toEqualTypeOf<CalendarEventProjection[]>();

    expect(() =>
      projectPlannerReadModel({
        ...input,
        calendarEntries: [calendarEntry(), calendarEntry()],
      }),
    ).toThrow("Duplicate Planner source identity 'schedule:schedule-1'");
  });
});
