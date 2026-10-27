import { TaskOccurrenceStatus } from '@memoflow/task-contracts';
import { describe, expect, it, vi } from 'vitest';
import { TaskActivityReadService } from './task-activity-read.service';

const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440000';

describe('TaskActivityReadService', () => {
  it('projects completed occurrences and new plans from identity-scoped facts', async () => {
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
    const service = new TaskActivityReadService({
      taskPlanRepository: taskPlanRepository as never,
      taskOccurrenceRepository: taskOccurrenceRepository as never,
    });

    await expect(
      service.listRecentActivity(IDENTITY_ID, { since: 5_000, limit: 10 }),
    ).resolves.toEqual([
      {
        id: 'task-completed-occurrence-1',
        type: 'task_completed',
        description: '完成了任务「Review PR」',
        timestamp: 10_000,
      },
      {
        id: 'task-created-task-1',
        type: 'task_created',
        description: '创建了新任务「Review PR」',
        timestamp: 7_000,
      },
    ]);

    expect(taskPlanRepository.findByIdentityId).toHaveBeenCalledWith(IDENTITY_ID);
    expect(taskOccurrenceRepository.findByIdentityId).toHaveBeenCalledWith(IDENTITY_ID);
  });

  it('falls back to the unnamed-plan description when no matching plan is visible', async () => {
    const service = new TaskActivityReadService({
      taskPlanRepository: { findByIdentityId: vi.fn(async () => []) } as never,
      taskOccurrenceRepository: {
        findByIdentityId: vi.fn(async () => [
          {
            id: 'occurrence-orphan',
            planId: 'task-missing',
            status: TaskOccurrenceStatus.Completed,
            result: { recordedAt: 10_000 },
            updatedAt: 10_000,
            deletedAt: null,
          },
        ]),
      } as never,
    });

    const result = await service.listRecentActivity(IDENTITY_ID, { since: 0 });
    expect(result).toEqual([
      {
        id: 'task-completed-occurrence-orphan',
        type: 'task_completed',
        description: '完成了任务「未命名任务」',
        timestamp: 10_000,
      },
    ]);
  });

  it('clamps the consumer limit to ten', async () => {
    const service = new TaskActivityReadService({
      taskPlanRepository: {
        findByIdentityId: vi.fn(async () =>
          Array.from({ length: 12 }, (_, index) => ({
            id: `task-${index}`,
            title: `Task ${index}`,
            createdAt: 100 + index,
            deletedAt: null,
          })),
        ),
      } as never,
      taskOccurrenceRepository: { findByIdentityId: vi.fn(async () => []) } as never,
    });

    const result = await service.listRecentActivity(IDENTITY_ID, { since: 0, limit: 100 });
    expect(result).toHaveLength(10);
    expect(result[0]?.id).toBe('task-created-task-11');
    expect(result[9]?.id).toBe('task-created-task-2');
  });
});
