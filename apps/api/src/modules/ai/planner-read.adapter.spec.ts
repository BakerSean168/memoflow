import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { PlannerAIReadAdapter } from './planner-read.adapter';

function fixture() {
  const scheduleRepository = {
    findByTimeRange: vi.fn(async () => [
      {
        id: 'calendar-1',
        title: 'Deep work',
        range: { kind: 'Timed', start: 1_000, end: 2_000 },
      },
      {
        id: 'calendar-2',
        title: 'Lunch',
        range: { kind: 'Timed', start: 3_000, end: 4_000 },
      },
      {
        id: 'calendar-all-day',
        title: 'Offsite',
        range: { kind: 'AllDay', start: '2026-09-15', end: null },
      },
    ]),
    getConflictProjection: vi.fn(async (_identityId: string, id: string) =>
      id === 'calendar-1'
        ? { hasConflict: true, conflictingEntries: ['calendar-2'] }
        : { hasConflict: false, conflictingEntries: null },
    ),
  };
  const taskApplicationPort = {
    getTaskOccurrencesByDateRange: vi.fn(async () =>
      ok({
        data: [
          {
            id: 'occ-2',
            planId: 'plan-2',
            scheduleSnapshot: { date: '2026-09-14', timing: { kind: 'AllDay' } },
            dueAt: 1_800,
            status: 'Completed',
          },
          {
            id: 'occ-1',
            planId: 'plan-1',
            scheduleSnapshot: { date: '2026-09-13', timing: { kind: 'AllDay' } },
            dueAt: 1_500,
            status: 'Pending',
          },
        ],
      } as never),
    ),
    listTaskPlans: vi.fn(async () =>
      ok({
        plans: [
          { id: 'plan-1', name: 'Write draft' },
          { id: 'plan-2', name: 'Review notes' },
        ],
      } as never),
    ),
  };
  return { scheduleRepository, taskApplicationPort };
}

describe('PlannerAIReadAdapter', () => {
  it('projects Calendar and Task owner facts without Scheduler worker state', async () => {
    const { scheduleRepository, taskApplicationPort } = fixture();
    const adapter = new PlannerAIReadAdapter(
      scheduleRepository as never,
      taskApplicationPort as never,
    );
    const summary = await adapter.getWindowSummary({
      identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
      startTime: 1_000,
      endTime: 5_000,
    });

    expect(summary.calendar[0]).toEqual({
      id: 'calendar-1',
      title: 'Deep work',
      startTime: 1_000,
      endTime: 2_000,
      hasConflict: true,
      conflictingEntryIds: ['calendar-2'],
    });
    expect(summary.tasks).toEqual([
      {
        id: 'occ-2',
        planId: 'plan-2',
        title: 'Review notes',
        scheduleDate: '2026-09-14',
        dueAt: 1_800,
        status: 'Completed',
      },
      {
        id: 'occ-1',
        planId: 'plan-1',
        title: 'Write draft',
        scheduleDate: '2026-09-13',
        dueAt: 1_500,
        status: 'Pending',
      },
    ]);
    expect(scheduleRepository.findByTimeRange).toHaveBeenCalledWith(
      'IdentityId_550e8400-e29b-41d4-a716-446655440000',
      1_000,
      5_000,
    );
    expect(summary.calendar).toHaveLength(2);
    expect(summary.calendar.find((entry) => entry.id === 'calendar-all-day')).toBeUndefined();
    expect(scheduleRepository.getConflictProjection).toHaveBeenCalledWith(
      'IdentityId_550e8400-e29b-41d4-a716-446655440000',
      'calendar-1',
    );
  });

  it('returns only conflicting Calendar entries and pending upcoming tasks', async () => {
    const { scheduleRepository, taskApplicationPort } = fixture();
    const adapter = new PlannerAIReadAdapter(
      scheduleRepository as never,
      taskApplicationPort as never,
    );

    await expect(
      adapter.getConflicts({
        identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
        startTime: 1_000,
        endTime: 5_000,
      }),
    ).resolves.toMatchObject({ conflictCount: 1, entries: [{ id: 'calendar-1' }] });
    await expect(
      adapter.getUpcomingTasks({
        identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
        startTime: 1_000,
        endTime: 5_000,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'occ-1', status: 'Pending', title: 'Write draft' }),
    ]);
  });
});
