import { describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import type { CalendarEventProjection } from '@memoflow/contracts/schedule';
import { asInstant, asYmd } from '@memoflow/time';
import {
  createPlannerOwnerCommandRouter,
  type PlannerMutationTimePort,
} from './planner-owner-command.router';
import { applyPlannerOptimisticMutation } from './planner-optimistic-mutation.adapter';

const dayStart = asInstant(Date.parse('2026-08-27T00:00:00.000Z'));
const at14 = asInstant(Number(dayStart) + 14 * 60 * 60_000);
const at15 = asInstant(Number(dayStart) + 15 * 60 * 60_000);
const at16 = asInstant(Number(dayStart) + 16 * 60 * 60_000);
const at17 = asInstant(Number(dayStart) + 17 * 60 * 60_000);

const time: PlannerMutationTimePort = {
  startOfDay: () => dayStart,
  toYmd: () => asYmd('2026-08-27'),
  startOfYmd: () => dayStart,
};

function taskProjection(
  overrides: Partial<Extract<CalendarEventProjection, { sourceType: 'task' }>> = {},
) {
  return {
    identityId: 'identity-1',
    sourceType: 'task' as const,
    sourceId: 'task-occurrence-1',
    title: 'Fixture J',
    start: at14,
    end: null,
    allDay: false as const,
    displayMetadata: { semantic: 'task-occurrence' as const, status: 'Pending' },
    editableCapabilities: { move: true, resize: false },
    ownerCommandTarget: { ownerType: 'task.instance' as const, ownerId: 'task-occurrence-1' },
    revision: 3,
    ...overrides,
  };
}

describe('PlannerOwnerCommandRouter (PLAN-4303)', () => {
  it('Fixture J routes Task 14:00 -> 16:00 to Task owner and reverts optimistic UI on conflict', async () => {
    const rescheduleInstance = vi
      .fn()
      .mockResolvedValue(
        fail({ code: 'CONFLICT', message: 'Task occurrence was changed elsewhere' }),
      );
    const router = createPlannerOwnerCommandRouter({
      task: { rescheduleInstance },
      time,
    });
    const projection = Object.freeze(taskProjection());
    const revert = vi.fn();

    const outcome = await applyPlannerOptimisticMutation(router, {
      kind: 'move',
      projection,
      nextRange: { allDay: false, start: at16, end: null },
      revert,
    });

    expect(rescheduleInstance).toHaveBeenCalledWith('task-occurrence-1', {
      newTime: {
        timeType: 'TimePoint',
        startDate: Number(dayStart),
        timePoint: 16 * 60,
        timeRange: null,
      },
      expectedVersion: 3,
    });
    expect(outcome).toEqual({
      status: 'conflict',
      code: 'CONFLICT',
    });
    expect(revert).toHaveBeenCalledTimes(1);
    expect(projection.start).toBe(at14);
    expect(projection.revision).toBe(3);
  });

  it('keeps the optimistic visual move when the Task owner accepts it', async () => {
    const rescheduleInstance = vi.fn().mockResolvedValue(ok({}));
    const router = createPlannerOwnerCommandRouter({ task: { rescheduleInstance }, time });
    const revert = vi.fn();

    const outcome = await applyPlannerOptimisticMutation(router, {
      kind: 'move',
      projection: taskProjection(),
      nextRange: { allDay: false, start: at16, end: null },
      revert,
    });

    expect(outcome).toEqual({ status: 'applied', ownerType: 'task.instance' });
    expect(revert).not.toHaveBeenCalled();
  });

  it('routes CalendarEntry resize to Schedule owner with projection revision', async () => {
    const updateSchedule = vi.fn().mockResolvedValue(ok({}));
    const router = createPlannerOwnerCommandRouter({ schedule: { updateSchedule }, time });
    const projection: Extract<CalendarEventProjection, { sourceType: 'schedule' }> = {
      identityId: 'identity-1',
      sourceType: 'schedule',
      sourceId: 'schedule-1',
      title: 'Block',
      start: at14,
      end: at15,
      allDay: false,
      displayMetadata: { semantic: 'calendar-entry' },
      editableCapabilities: { move: true, resize: true },
      ownerCommandTarget: { ownerType: 'schedule.calendar-entry', ownerId: 'schedule-1' },
      revision: 8,
    };

    const outcome = await router.route({
      kind: 'resize',
      projection,
      nextRange: { allDay: false, start: at14, end: at17 },
    });

    expect(updateSchedule).toHaveBeenCalledWith('schedule-1', {
      startTime: Number(at14),
      endTime: Number(at17),
      expectedVersion: 8,
    });
    expect(outcome.status).toBe('applied');
  });

  it('routes an exact-day Goal target move to Goal owner and never turns it into a Scheduler mutation', async () => {
    const updateGoal = vi.fn().mockResolvedValue(ok({}));
    const nextDayStart = asInstant(Number(dayStart) + 24 * 60 * 60_000);
    const router = createPlannerOwnerCommandRouter({
      goal: { updateGoal },
      time: {
        ...time,
        startOfYmd: (ymd) => (ymd === asYmd('2026-08-28') ? nextDayStart : dayStart),
      },
    });
    const projection: Extract<CalendarEventProjection, { sourceType: 'goal' }> = {
      identityId: 'identity-1',
      sourceType: 'goal',
      sourceId: 'goal-1:target',
      title: 'Goal',
      start: asYmd('2026-08-27'),
      end: null,
      allDay: true,
      displayMetadata: { semantic: 'goal-target' },
      editableCapabilities: { move: true, resize: false },
      ownerCommandTarget: { ownerType: 'goal.goal', ownerId: 'goal-1' },
      revision: 5,
    };

    const outcome = await router.route({
      kind: 'move',
      projection,
      nextRange: { allDay: true, start: asYmd('2026-08-28'), end: null },
    });

    expect(updateGoal).toHaveBeenCalledWith('goal-1', {
      target: { kind: 'day', date: asYmd('2026-08-28') },
      expectedVersion: 5,
    });
    expect(outcome.status).toBe('applied');
  });

  it('routes an explicitly editable Routine wall-clock occurrence to the Routine owner port', async () => {
    const rescheduleOccurrence = vi.fn().mockResolvedValue(ok({}));
    const router = createPlannerOwnerCommandRouter({
      routine: { rescheduleOccurrence },
      time,
    });
    const projection: Extract<CalendarEventProjection, { sourceType: 'routine' }> = {
      identityId: 'identity-1',
      sourceType: 'routine',
      sourceId: 'routine:routine-1:oc:fixture',
      title: 'Wind down',
      start: at14,
      end: at15,
      allDay: false,
      displayMetadata: { semantic: 'routine-wall-clock' },
      editableCapabilities: { move: true, resize: false },
      ownerCommandTarget: { ownerType: 'routine.routine', ownerId: 'routine-1' },
      revision: 9,
    };
    const nextRange = { allDay: false as const, start: at16, end: at17 };

    const outcome = await router.route({ kind: 'move', projection, nextRange });

    expect(rescheduleOccurrence).toHaveBeenCalledWith({
      routineId: 'routine-1',
      occurrenceId: 'routine:routine-1:oc:fixture',
      expectedVersion: 9,
      nextRange,
    });
    expect(outcome).toEqual({ status: 'applied', ownerType: 'routine.routine' });
  });

  it('enforces read-only capabilities before resolving any owner port', async () => {
    const router = createPlannerOwnerCommandRouter({ time });
    const projection = taskProjection({ editableCapabilities: { move: false, resize: false } });
    const revert = vi.fn();

    const outcome = await applyPlannerOptimisticMutation(router, {
      kind: 'move',
      projection,
      nextRange: { allDay: false, start: at16, end: null },
      revert,
    });

    expect(outcome).toMatchObject({ status: 'read-only' });
    expect(revert).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-day Task time ranges rather than corrupting TaskTimeConfig', async () => {
    const rescheduleInstance = vi.fn();
    const otherDay = asInstant(Number(dayStart) + 24 * 60 * 60_000 + 30 * 60_000);
    const router = createPlannerOwnerCommandRouter({
      task: { rescheduleInstance },
      time: {
        startOfDay: (instant) =>
          instant === otherDay ? asInstant(Number(dayStart) + 24 * 60 * 60_000) : dayStart,
        toYmd: (instant) => (instant === otherDay ? asYmd('2026-08-28') : asYmd('2026-08-27')),
        startOfYmd: () => dayStart,
      },
    });

    const outcome = await router.route({
      kind: 'move',
      projection: taskProjection({ end: at15 }),
      nextRange: { allDay: false, start: at16, end: otherDay },
    });

    expect(outcome).toMatchObject({ status: 'invalid' });
    expect(rescheduleInstance).not.toHaveBeenCalled();
  });
});
