import { describe, expect, it, vi } from 'vitest';
import type { EventApi } from '@fullcalendar/vue3';
import { fail, ok } from '@memoflow/contracts/result';
import type { CalendarEventProjection } from '@memoflow/contracts/schedule';
import { asInstant, asYmd } from '@memoflow/time';
import {
  createPlannerOwnerCommandRouter,
  type PlannerMutationTimePort,
  type PlannerMutationOutcome,
} from './planner-owner-command.router';
import { applyFullCalendarPlannerMutation } from './planner-fullcalendar-mutation.adapter';

const dayStart = asInstant(Date.parse('2026-08-27T00:00:00.000Z'));
const time: PlannerMutationTimePort = {
  startOfDay: () => dayStart,
  toYmd: () => asYmd('2026-08-27'),
};

function projection(): Extract<CalendarEventProjection, { sourceType: 'task' }> {
  return {
    identityId: 'identity-1',
    sourceType: 'task',
    sourceId: 'task-1',
    title: 'Fixture J',
    start: asInstant(Number(dayStart) + 14 * 60 * 60_000),
    end: null,
    allDay: false,
    displayMetadata: { semantic: 'task-occurrence', status: 'Pending' },
    editableCapabilities: { move: true, resize: false },
    ownerCommandTarget: { ownerType: 'task.occurrence', ownerId: 'task-1' },
    revision: 6,
  };
}

function event(start: Date | null, p: CalendarEventProjection): EventApi {
  return {
    start,
    end: null,
    allDay: false,
    extendedProps: { projection: p },
  } as unknown as EventApi;
}

describe('FullCalendar Planner owner mutation bridge (PLAN-4303)', () => {
  it('converts eventDrop Date into Product Time and reverts a failed Task owner command', async () => {
    const rescheduleOccurrence = vi
      .fn()
      .mockResolvedValue(fail({ code: 'CONFLICT', message: 'stale' }));
    const router = createPlannerOwnerCommandRouter({ task: { rescheduleOccurrence }, time });
    const revert = vi.fn();

    const outcome = await applyFullCalendarPlannerMutation(
      'move',
      { event: event(new Date(Number(dayStart) + 16 * 60 * 60_000), projection()), revert },
      router,
      time,
    );

    expect(rescheduleOccurrence).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        expectedVersion: 6,
        scheduleSnapshot: { date: '2026-08-27', timing: { kind: 'At', time: '16:00' } },
      }),
    );
    expect(outcome.status).toBe('conflict');
    expect(revert).toHaveBeenCalledTimes(1);
  });

  it('defensively reverts malformed FullCalendar events before owner routing', async () => {
    const rescheduleOccurrence = vi.fn();
    const router = createPlannerOwnerCommandRouter({ task: { rescheduleOccurrence }, time });
    const revert = vi.fn();

    const outcome = await applyFullCalendarPlannerMutation(
      'move',
      { event: event(null, projection()), revert },
      router,
      time,
    );

    expect(outcome.status).toBe('invalid');
    expect(rescheduleOccurrence).not.toHaveBeenCalled();
    expect(revert).toHaveBeenCalledTimes(1);
  });
  it.each(['move', 'resize'] as const)('rolls back a thrown %s owner command', async (kind) => {
    const p = projection();
    p.editableCapabilities = { move: true, resize: true };
    const before = structuredClone(p);
    const rescheduleOccurrence = vi.fn().mockRejectedValue(new Error('network lost'));
    const router = createPlannerOwnerCommandRouter({ task: { rescheduleOccurrence }, time });
    const revert = vi.fn();
    const outcome = await applyFullCalendarPlannerMutation(
      kind,
      {
        event: event(new Date(Number(dayStart) + 16 * 60 * 60_000), p),
        revert,
      },
      router,
      time,
    );
    expect(outcome).toMatchObject({ status: 'failed' });
    expect(rescheduleOccurrence).toHaveBeenCalledOnce();
    expect(revert).toHaveBeenCalledOnce();
    expect(p).toEqual(before);
  });

  it.each([true, false])(
    'dispatches the same rollback closure once, applied=%s',
    async (applied) => {
      const rescheduleOccurrence = vi
        .fn()
        .mockResolvedValue(applied ? ok({}) : fail({ code: 'CONFLICT', message: 'occupied' }));
      const router = createPlannerOwnerCommandRouter({ task: { rescheduleOccurrence }, time });
      const info = {
        event: event(new Date(Number(dayStart) + 16 * 60 * 60_000), projection()),
        revert: vi.fn(),
      };
      const outcomes = await Promise.all([
        applyFullCalendarPlannerMutation('move', info, router, time),
        applyFullCalendarPlannerMutation('move', { ...info }, router, time),
      ]);
      await applyFullCalendarPlannerMutation('move', info, router, time);
      expect(outcomes[0]).toEqual(outcomes[1]);
      expect(rescheduleOccurrence).toHaveBeenCalledOnce();
      expect(info.revert).toHaveBeenCalledTimes(applied ? 0 : 1);
      // A fresh FullCalendar rollback closure is a distinct gesture, even for the same range/version.
      await applyFullCalendarPlannerMutation('move', { ...info, revert: vi.fn() }, router, time);
      expect(rescheduleOccurrence).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['move', 'resize'] as const)(
    'preserves applied CalendarEntry %s and its CAS version',
    async (kind) => {
      const p: CalendarEventProjection = {
        ...projection(),
        sourceType: 'schedule',
        sourceId: 'entry',
        displayMetadata: { semantic: 'calendar-entry' },
        ownerCommandTarget: { ownerType: 'schedule.calendar-entry', ownerId: 'entry' },
        editableCapabilities: { move: true, resize: true },
      };
      const before = structuredClone(p);
      const start = Number(dayStart) + 16 * 60 * 60_000;
      const end = start + 60 * 60_000;
      const updateSchedule = vi.fn().mockResolvedValue(ok({}));
      const router = createPlannerOwnerCommandRouter({ schedule: { updateSchedule }, time });
      const revert = vi.fn();
      const e = event(new Date(start), p);
      Object.assign(e, { end: new Date(end) });
      expect(
        await applyFullCalendarPlannerMutation(kind, { event: e, revert }, router, time),
      ).toMatchObject({ status: 'applied' });
      expect(updateSchedule).toHaveBeenCalledExactlyOnceWith('entry', {
        expectedVersion: 6,
        range: { kind: 'Timed', start, end },
      });
      expect(revert).not.toHaveBeenCalled();
      expect(p).toEqual(before);
    },
  );

  const rejections: PlannerMutationOutcome[] = [
    {
      status: 'conflict',
      code: 'CONFLICT',
      message: 'occupied',
      reason: 'target-date-occupied',
      ownerType: 'task.occurrence',
    },
    {
      status: 'conflict',
      code: 'CONFLICT',
      message: 'stale',
      reason: 'stale-version',
      ownerType: 'task.occurrence',
    },
    {
      status: 'conflict',
      code: 'CONFLICT',
      message: 'conflict',
      reason: 'generic',
      ownerType: 'task.occurrence',
    },
    { status: 'failed', code: 'INTERNAL_ERROR', message: 'failed', ownerType: 'task.occurrence' },
    { status: 'invalid', message: 'invalid' },
    { status: 'unsupported', message: 'unsupported' },
    { status: 'read-only', message: 'read-only' },
  ];
  it.each(
    rejections.flatMap((outcome) =>
      (['move', 'resize'] as const).map((kind) => ({ outcome, kind })),
    ),
  )(
    'reverts $kind exactly once for $outcome.status/$outcome.message',
    async ({ outcome, kind }) => {
      const p = projection();
      const before = structuredClone(p);
      const route = vi.fn().mockResolvedValue(outcome);
      const revert = vi.fn();
      expect(
        await applyFullCalendarPlannerMutation(
          kind,
          { event: event(new Date(Number(dayStart) + 16 * 60 * 60_000), p), revert },
          { route },
          time,
        ),
      ).toEqual(outcome);
      expect(route).toHaveBeenCalledOnce();
      expect(revert).toHaveBeenCalledOnce();
      expect(p).toEqual(before);
    },
  );

  it.each([null, new Date(NaN)])('reverts an invalid start %s without dispatch', async (start) => {
    const route = vi.fn();
    const revert = vi.fn();
    expect(
      await applyFullCalendarPlannerMutation(
        'move',
        { event: event(start, projection()), revert },
        { route },
        time,
      ),
    ).toMatchObject({ status: 'invalid' });
    expect(route).not.toHaveBeenCalled();
    expect(revert).toHaveBeenCalledOnce();
  });

  it('reverts missing projection exactly once even if its callback is replayed', async () => {
    const e = event(new Date(), projection());
    Object.assign(e, { extendedProps: {} });
    const info = { event: e, revert: vi.fn() };
    const router = { route: vi.fn() };
    await Promise.all([
      applyFullCalendarPlannerMutation('move', info, router, time),
      applyFullCalendarPlannerMutation('move', info, router, time),
    ]);
    expect(info.revert).toHaveBeenCalledOnce();
    expect(router.route).not.toHaveBeenCalled();
  });
  it('reverts a Product Time conversion exception before dispatching the owner', async () => {
    const p = { ...projection(), allDay: true } as CalendarEventProjection;
    const e = event(new Date(Number(dayStart)), p);
    Object.assign(e, { allDay: true });
    const router = { route: vi.fn() };
    const revert = vi.fn();
    expect(
      await applyFullCalendarPlannerMutation('move', { event: e, revert }, router, {
        ...time,
        toYmd: () => {
          throw new Error('invalid time');
        },
      }),
    ).toMatchObject({ status: 'invalid' });
    expect(router.route).not.toHaveBeenCalled();
    expect(revert).toHaveBeenCalledOnce();
  });
});
