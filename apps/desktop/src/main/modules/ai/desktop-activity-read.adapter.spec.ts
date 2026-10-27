import { describe, expect, it, vi } from 'vitest';
import { DesktopActivityAIReadAdapter } from './desktop-activity-read.adapter';

const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440000';

describe('DesktopActivityAIReadAdapter', () => {
  it('assembles bounded recent activity from domain-owned capabilities', async () => {
    const goalActivity = {
      listRecentActivity: vi.fn(async () => [
        {
          id: 'goal-updated-goal-1',
          type: 'goal_updated' as const,
          description: '更新了目标「Ship vNext」的进度',
          timestamp: 8_000,
        },
      ]),
    };
    const taskActivity = {
      listRecentActivity: vi.fn(async () => [
        {
          id: 'task-completed-occurrence-1',
          type: 'task_completed' as const,
          description: '完成了任务「Review PR」',
          timestamp: 10_000,
        },
        {
          id: 'task-created-task-1',
          type: 'task_created' as const,
          description: '创建了新任务「Review PR」',
          timestamp: 7_000,
        },
      ]),
    };
    const scheduleActivity = {
      listRecentActivity: vi.fn(async () => [
        {
          id: 'schedule-created-schedule-1',
          type: 'schedule_created' as const,
          description: '创建了日程「Focus block」',
          timestamp: 9_000,
        },
      ]),
    };

    const adapter = new DesktopActivityAIReadAdapter({
      goalActivity,
      taskActivity,
      scheduleActivity,
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

    expect(goalActivity.listRecentActivity).toHaveBeenCalledWith(IDENTITY_ID, {
      since: 5_000,
      limit: 3,
    });
    expect(taskActivity.listRecentActivity).toHaveBeenCalledWith(IDENTITY_ID, {
      since: 5_000,
      limit: 3,
    });
    expect(scheduleActivity.listRecentActivity).toHaveBeenCalledWith(IDENTITY_ID, {
      since: 5_000,
      limit: 3,
    });
  });

  it('clamps the consumer limit to ten', async () => {
    const taskActivity = {
      listRecentActivity: vi.fn(async () =>
        Array.from({ length: 12 }, (_, index) => ({
          id: `task-created-task-${index}`,
          type: 'task_created' as const,
          description: `创建了新任务「Task ${index}」`,
          timestamp: 100 + index,
        })),
      ),
    };
    const adapter = new DesktopActivityAIReadAdapter({
      goalActivity: { listRecentActivity: vi.fn(async () => []) },
      taskActivity,
      scheduleActivity: { listRecentActivity: vi.fn(async () => []) },
    });

    const result = await adapter.listRecent({ identityId: IDENTITY_ID, since: 0, limit: 100 });
    expect(result).toHaveLength(10);
    expect(result[0]?.id).toBe('task-created-task-11');
    expect(result[9]?.id).toBe('task-created-task-2');
  });
});
