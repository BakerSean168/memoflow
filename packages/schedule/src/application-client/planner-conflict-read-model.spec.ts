import { describe, expect, it } from 'vitest';
import type { CalendarEventProjection } from '@memoflow/contracts/schedule';
import { asInstant, asYmd } from '@memoflow/time';
import { derivePlannerConflicts, plannerConflictSourceKeys } from './planner-conflict-read-model';

function timed(overrides: Partial<Extract<CalendarEventProjection, { allDay: false }>> = {}) {
  return {
    identityId: 'identity-1',
    sourceType: 'schedule',
    sourceId: 'schedule-1',
    title: 'Calendar',
    occupancy: 'blocking',
    allDay: false,
    start: asInstant(1_000),
    end: asInstant(4_000),
    displayMetadata: { semantic: 'calendar-entry' },
    editableCapabilities: { move: true, resize: true },
    ownerCommandTarget: { ownerType: 'schedule.calendar-entry', ownerId: 'schedule-1' },
    revision: 1,
    ...overrides,
  } as Extract<CalendarEventProjection, { allDay: false }>;
}

describe('derivePlannerConflicts', () => {
  it('derives a cross-source blocking conflict without persisting owner conflict truth', () => {
    const task = timed({
      sourceType: 'task',
      sourceId: 'task-1',
      title: 'Task window',
      start: asInstant(2_000),
      end: asInstant(5_000),
      displayMetadata: { semantic: 'task-occurrence' },
      editableCapabilities: { move: true, resize: false },
      ownerCommandTarget: { ownerType: 'task.occurrence', ownerId: 'task-1' },
    } as Partial<Extract<CalendarEventProjection, { allDay: false }>>);
    const conflicts = derivePlannerConflicts([task, timed()]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      left: { sourceType: 'schedule', sourceId: 'schedule-1' },
      right: { sourceType: 'task', sourceId: 'task-1' },
      overlapRange: { kind: 'Timed', start: 2_000, end: 4_000 },
      overlapDurationMs: 2_000,
      suggestions: [],
    });
    expect(plannerConflictSourceKeys(conflicts)).toEqual(
      new Set(['schedule:schedule-1', 'task:task-1']),
    );
  });

  it('ignores marker, non-blocking, all-day and cross-identity projections', () => {
    const calendar = timed();
    const point = timed({
      sourceType: 'routine',
      sourceId: 'routine-1',
      occupancy: 'marker',
      ownerCommandTarget: { ownerType: 'routine.routine', ownerId: 'routine-1' },
      displayMetadata: { semantic: 'routine-wall-clock' },
    } as Partial<Extract<CalendarEventProjection, { allDay: false }>>);
    const otherIdentity = timed({ sourceId: 'schedule-other', identityId: 'identity-2' });
    const allDay: CalendarEventProjection = {
      identityId: 'identity-1',
      sourceType: 'task',
      sourceId: 'task-all-day',
      title: 'All day task',
      occupancy: 'non-blocking',
      allDay: true,
      start: asYmd('2026-09-17'),
      end: null,
      displayMetadata: { semantic: 'task-occurrence' },
      editableCapabilities: { move: true, resize: false },
      ownerCommandTarget: { ownerType: 'task.occurrence', ownerId: 'task-all-day' },
      revision: 1,
    };
    expect(derivePlannerConflicts([calendar, point, otherIdentity, allDay])).toEqual([]);
  });

  it('is deterministic regardless of projection input order', () => {
    const a = timed({ sourceId: 'b', start: asInstant(0), end: asInstant(7_200_000) });
    const b = timed({ sourceId: 'a', start: asInstant(3_600_000), end: asInstant(10_800_000) });
    expect(derivePlannerConflicts([a, b])).toEqual(derivePlannerConflicts([b, a]));
    expect(derivePlannerConflicts([a, b])[0]?.severity).toBe('Moderate');
  });
});
