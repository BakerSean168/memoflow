import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { PlannerAIReadAdapter } from './planner-read.adapter';

const identityId = 'IdentityId_550e8400-e29b-41d4-a716-446655440000';
const range = { start: 1_000, end: 5_000 };

function fixture() {
  const scheduleEventApi = {
    listEvents: vi.fn(async () =>
      ok([
        {
          id: 'ScheduleId_550e8400-e29b-41d4-a716-446655440001',
          identityId,
          title: 'Deep work',
          range: { kind: 'Timed', start: 1_000, end: 2_000 },
          version: 1,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'ScheduleId_550e8400-e29b-41d4-a716-446655440002',
          identityId,
          title: 'Lunch',
          range: { kind: 'Timed', start: 1_500, end: 2_500 },
          version: 1,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'ScheduleId_550e8400-e29b-41d4-a716-446655440003',
          identityId,
          title: 'Offsite',
          range: { kind: 'AllDay', start: '2026-09-15', end: null },
          version: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ] as never),
    ),
  };
  const taskApplicationPort = {
    getTaskOccurrencesByDateRange: vi.fn(async () =>
      ok({
        data: [
          {
            id: 'occ-2',
            planId: 'plan-2',
            identityId,
            occurrenceKey: 'occurrence-2',
            scheduleSnapshot: { date: '2026-09-14', timing: { kind: 'AllDay' } },
            importanceSnapshot: 'Moderate',
            status: 'Completed',
            actualStartAt: null,
            result: null,
            checklistState: [],
            dueAt: 1_800,
            isOverdue: false,
            version: 1,
            createdAt: 1,
            updatedAt: 1,
            deletedAt: null,
          },
          {
            id: 'occ-1',
            planId: 'plan-1',
            identityId,
            occurrenceKey: 'occurrence-1',
            scheduleSnapshot: {
              date: '2026-09-13',
              timing: { kind: 'Window', start: '09:00', end: '10:00' },
            },
            importanceSnapshot: 'Moderate',
            status: 'Pending',
            actualStartAt: null,
            result: null,
            checklistState: [],
            dueAt: 1_500,
            isOverdue: false,
            version: 1,
            createdAt: 1,
            updatedAt: 1,
            deletedAt: null,
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
  const userTimeContextPort = {
    getUserTimeContext: vi.fn(async () => ({ timeZone: 'UTC', weekStartsOn: 1 as const })),
  };
  return { scheduleEventApi, taskApplicationPort, userTimeContextPort };
}

describe('PlannerAIReadAdapter', () => {
  it('projects owner facts into canonical Planner ranges and derives conflicts', async () => {
    const { scheduleEventApi, taskApplicationPort, userTimeContextPort } = fixture();
    const adapter = new PlannerAIReadAdapter(
      scheduleEventApi as never,
      taskApplicationPort as never,
      userTimeContextPort,
    );
    const summary = await adapter.getWindowSummary({ identityId, range });

    expect(summary.range).toEqual(range);
    expect(summary.projections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'schedule',
          sourceId: 'ScheduleId_550e8400-e29b-41d4-a716-446655440001',
          occupancy: 'blocking',
          allDay: false,
          start: 1_000,
          end: 2_000,
        }),
        expect.objectContaining({
          sourceType: 'schedule',
          sourceId: 'ScheduleId_550e8400-e29b-41d4-a716-446655440003',
          allDay: true,
          start: '2026-09-15',
        }),
        expect.objectContaining({
          sourceType: 'task',
          sourceId: 'occ-1',
          occupancy: 'blocking',
          displayMetadata: expect.objectContaining({ semantic: 'task-occurrence' }),
        }),
      ]),
    );
    expect(summary.conflicts).toHaveLength(1);
    expect(summary.projections.every((projection) => !('dueAt' in projection))).toBe(true);
    expect(scheduleEventApi.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ identityId, startTime: range.start, endTime: range.end }),
      expect.objectContaining({ identityId, source: 'system' }),
    );
  });

  it('returns only active Task owner projections for upcoming reads', async () => {
    const { scheduleEventApi, taskApplicationPort, userTimeContextPort } = fixture();
    const adapter = new PlannerAIReadAdapter(
      scheduleEventApi as never,
      taskApplicationPort as never,
      userTimeContextPort,
    );

    await expect(adapter.getConflicts({ identityId, range })).resolves.toMatchObject({
      range,
      conflicts: expect.any(Array),
    });
    await expect(adapter.getUpcomingTasks({ identityId, range })).resolves.toEqual([
      expect.objectContaining({
        sourceType: 'task',
        sourceId: 'occ-1',
        displayMetadata: expect.objectContaining({ status: 'Pending' }),
      }),
    ]);
  });
});
