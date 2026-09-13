import { describe, expect, it, vi } from 'vitest';
import type { EventApi } from '@fullcalendar/vue3';
import { fail } from '@memoflow/contracts/result';
import type { CalendarEventProjection } from '@memoflow/contracts/schedule';
import { asInstant, asYmd } from '@memoflow/time';
import {
  createPlannerOwnerCommandRouter,
  type PlannerMutationTimePort,
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
});
