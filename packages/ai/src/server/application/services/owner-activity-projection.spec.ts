import { describe, expect, it } from 'vitest';
import { projectAIOwnerActivity } from './owner-activity-projection';

describe('projectAIOwnerActivity', () => {
  it('filters, orders and bounds owner facts without creating durable activity truth', () => {
    const result = projectAIOwnerActivity({
      goals: [
        { id: 'goal-1', name: 'Ship vNext', updatedAt: 8_000, deleted: false },
        { id: 'goal-old', name: 'Old', updatedAt: 1_000, deleted: false },
      ],
      taskPlans: [
        { id: 'task-1', title: 'Review PR', createdAt: 7_000, deleted: false },
        { id: 'task-deleted', title: 'Deleted', createdAt: 9_500, deleted: true },
      ],
      taskOccurrences: [
        {
          id: 'occurrence-1',
          planId: 'task-1',
          completed: true,
          timestamp: 10_000,
          deleted: false,
        },
        {
          id: 'occurrence-pending',
          planId: 'task-1',
          completed: false,
          timestamp: 9_500,
          deleted: false,
        },
      ],
      schedules: [{ id: 'schedule-1', title: 'Focus block', createdAt: 9_000 }],
      since: 5_000,
      limit: 3,
    });

    expect(result).toEqual([
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
  });

  it('clamps consumer requests to ten items', () => {
    const result = projectAIOwnerActivity({
      goals: [],
      taskPlans: Array.from({ length: 12 }, (_, index) => ({
        id: `task-${index}`,
        title: `Task ${index}`,
        createdAt: 100 + index,
        deleted: false,
      })),
      taskOccurrences: [],
      schedules: [],
      since: 0,
      limit: 100,
    });
    expect(result).toHaveLength(10);
    expect(result[0]?.id).toBe('task-created-task-11');
    expect(result[9]?.id).toBe('task-created-task-2');
  });
});
