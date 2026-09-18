import { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import { describe, expect, it, vi } from 'vitest';
import { OwnerActivityAIReadAdapter } from './owner-activity-read.adapter';

const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440000';

describe('OwnerActivityAIReadAdapter', () => {
  it('derives bounded recent activity from owner facts without a durable activity ledger', async () => {
    const goalRepository = {
      findByIdentityId: vi.fn(async () => [
        {
          id: 'goal-1',
          name: 'Ship vNext',
          updatedAt: 8_000,
          deletedAt: null,
        },
        {
          id: 'goal-old',
          name: 'Old goal',
          updatedAt: 1_000,
          deletedAt: null,
        },
      ]),
    };
    const taskPlanRepository = {
      findByIdentityId: vi.fn(async () => [
        { id: 'task-1', title: 'Review PR', createdAt: 7_000, deletedAt: null },
        { id: 'task-deleted', title: 'Deleted', createdAt: 9_500, deletedAt: 9_600 },
      ]),
    };
    const taskOccurrenceRepository = {
      findByIdentityId: vi.fn(async () => [
        {
          id: 'occurrence-1',
          planId: 'task-1',
          status: TaskOccurrenceStatus.Completed,
          result: { recordedAt: 10_000 },
          updatedAt: 9_000,
          deletedAt: null,
        },
        {
          id: 'occurrence-pending',
          planId: 'task-1',
          status: TaskOccurrenceStatus.Pending,
          result: null,
          updatedAt: 9_500,
          deletedAt: null,
        },
      ]),
    };
    const scheduleRepository = {
      findByIdentityId: vi.fn(async () => [
        { id: 'schedule-1', title: 'Focus block', createdAt: 9_000 },
      ]),
    };

    const adapter = new OwnerActivityAIReadAdapter({
      goalRepository: goalRepository as never,
      taskPlanRepository: taskPlanRepository as never,
      taskOccurrenceRepository: taskOccurrenceRepository as never,
      scheduleRepository: scheduleRepository as never,
    });

    await expect(
      adapter.listRecent({ identityId: IDENTITY_ID, since: 5_000, limit: 3 }),
    ).resolves.toEqual([
      {
        id: 'task-completed-occurrence-1',
        type: 'task_completed',
        description: '完成了任务「Review PR」',
        timestamp: 10_000,
      },
      {
        id: 'schedule-created-schedule-1',
        type: 'schedule_created',
        description: '创建了日程「Focus block」',
        timestamp: 9_000,
      },
      {
        id: 'goal-updated-goal-1',
        type: 'goal_updated',
        description: '更新了目标「Ship vNext」的进度',
        timestamp: 8_000,
      },
    ]);

    expect(goalRepository.findByIdentityId).toHaveBeenCalledWith(IDENTITY_ID, {
      includeChildren: false,
      systemView: 'active',
    });
    expect(taskPlanRepository.findByIdentityId).toHaveBeenCalledWith(IDENTITY_ID);
    expect(taskOccurrenceRepository.findByIdentityId).toHaveBeenCalledWith(IDENTITY_ID);
    expect(scheduleRepository.findByIdentityId).toHaveBeenCalledWith(IDENTITY_ID);
  });

  it('clamps the consumer limit to ten', async () => {
    const taskPlanRepository = {
      findByIdentityId: vi.fn(async () =>
        Array.from({ length: 12 }, (_, index) => ({
          id: `task-${index}`,
          title: `Task ${index}`,
          createdAt: 100 + index,
          deletedAt: null,
        })),
      ),
    };
    const adapter = new OwnerActivityAIReadAdapter({
      goalRepository: { findByIdentityId: vi.fn(async () => []) } as never,
      taskPlanRepository: taskPlanRepository as never,
      taskOccurrenceRepository: { findByIdentityId: vi.fn(async () => []) } as never,
      scheduleRepository: { findByIdentityId: vi.fn(async () => []) } as never,
    });

    const result = await adapter.listRecent({ identityId: IDENTITY_ID, since: 0, limit: 100 });
    expect(result).toHaveLength(10);
    expect(result[0]?.id).toBe('task-created-task-11');
    expect(result[9]?.id).toBe('task-created-task-2');
  });
});
