import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { PlannerAIReadAdapter } from './planner-read.adapter';

function fixture() {
  const scheduleRepository = {
    findByTimeRange: vi.fn(async () => [
      {
        id: 'calendar-1',
        title: 'Deep work',
        startTime: 1_000,
        endTime: 2_000,
        hasConflict: true,
        conflictingEntries: ['calendar-2'],
      },
      {
        id: 'calendar-2',
        title: 'Lunch',
        startTime: 3_000,
        endTime: 4_000,
        hasConflict: false,
        conflictingEntries: [],
      },
    ]),
  };
  const taskApplicationPort = {
    getTaskOccurrencesByDateRange: vi.fn(async () => ok({ data: [
      { id: 'occ-2', templateId: 'plan-2', instanceDate: 1_800, status: 'Completed' },
      { id: 'occ-1', templateId: 'plan-1', instanceDate: 1_500, status: 'Pending' },
    ] } as never)),
    listTaskPlans: vi.fn(async () => ok({ templates: [
      { id: 'plan-1', name: 'Write draft' },
      { id: 'plan-2', name: 'Review notes' },
    ] } as never)),
  };
  return { scheduleRepository, taskApplicationPort };
}

describe('PlannerAIReadAdapter', () => {
  it('projects Calendar and Task owner facts without Scheduler worker state', async () => {
    const { scheduleRepository, taskApplicationPort } = fixture();
    const adapter = new PlannerAIReadAdapter(scheduleRepository as never, taskApplicationPort as never);
    const summary = await adapter.getWindowSummary({ identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000', startTime: 1_000, endTime: 5_000 });

    expect(summary.calendar[0]).toEqual({
      id: 'calendar-1',
      title: 'Deep work',
      startTime: 1_000,
      endTime: 2_000,
      hasConflict: true,
      conflictingEntryIds: ['calendar-2'],
    });
    expect(summary.tasks.map((task) => task.title)).toEqual(['Review notes', 'Write draft']);
    expect(scheduleRepository.findByTimeRange).toHaveBeenCalledWith('IdentityId_550e8400-e29b-41d4-a716-446655440000', 1_000, 5_000);
  });

  it('returns only conflicting Calendar entries and pending upcoming tasks', async () => {
    const { scheduleRepository, taskApplicationPort } = fixture();
    const adapter = new PlannerAIReadAdapter(scheduleRepository as never, taskApplicationPort as never);

    await expect(adapter.getConflicts({ identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000', startTime: 1_000, endTime: 5_000 }))
      .resolves.toMatchObject({ conflictCount: 1, entries: [{ id: 'calendar-1' }] });
    await expect(adapter.getUpcomingTasks({ identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000', startTime: 1_000, endTime: 5_000 }))
      .resolves.toEqual([expect.objectContaining({ id: 'occ-1', status: 'Pending', title: 'Write draft' })]);
  });
});
