import { describe, expect, it, vi } from 'vitest';
import { ok, error } from '@memoflow/contracts/result';
import type { TaskGoalProgressOutboxEventV2 } from '@memoflow/contracts/task';
import { GoalTaskProgressHandler } from './task-goal-progress.handler';

function applyEvent(
  source: 'TaskOccurrence' | 'TaskPlan' = 'TaskOccurrence',
  overrides: Partial<Extract<TaskGoalProgressOutboxEventV2, { action: 'apply' }>> = {},
): Extract<TaskGoalProgressOutboxEventV2, { action: 'apply' }> {
  return {
    eventId: 'task-goal-apply:1',
    schemaVersion: 2,
    eventType: 'task.goal-progress-requested',
    action: 'apply',
    identityId: 'identity-1' as never,
    taskOccurrenceId: 'instance-1' as never,
    taskPlanId: 'template-1' as never,
    goalId: 'goal-1' as never,
    keyResultId: 'kr-1' as never,
    value: 3,
    source: { type: source, id: source === 'TaskPlan' ? 'template-1' : 'instance-1' },
    taskTitle: 'Write tests',
    occurredAt: 1000,
    ...overrides,
  };
}

function revertEvent(): Extract<TaskGoalProgressOutboxEventV2, { action: 'revert' }> {
  return {
    eventId: 'task-goal-revert:1',
    schemaVersion: 2,
    eventType: 'task.goal-progress-requested',
    action: 'revert',
    identityId: 'identity-1' as never,
    taskOccurrenceId: 'instance-1' as never,
    taskPlanId: 'template-1' as never,
    sources: [
      { type: 'TaskOccurrence', id: 'instance-1' },
      { type: 'TaskPlan', id: 'template-1' },
    ],
    occurredAt: 2000,
  };
}

function handler(overrides: { create?: ReturnType<typeof vi.fn>; remove?: ReturnType<typeof vi.fn> } = {}) {
  return new GoalTaskProgressHandler(
    { execute: overrides.create ?? vi.fn(async () => ok({} as never)) },
    { execute: overrides.remove ?? vi.fn(async () => ok({} as never)) },
  );
}

describe('GoalTaskProgressHandler', () => {
  it('uses an explicit instance settlement source', async () => {
    const execute = vi.fn(async () => ok({} as never));
    await handler({ create: execute }).handle(applyEvent());
    expect(execute).toHaveBeenCalledWith(
      'goal-1',
      'kr-1',
      {
        value: 3,
        note: '任务实例完成: Write tests',
        source: { type: 'TASK_INSTANCE', id: 'instance-1' },
      },
      'identity-1',
    );
  });

  it('uses an explicit plan settlement source without trigger inference', async () => {
    const execute = vi.fn(async () => ok({} as never));
    await handler({ create: execute }).handle(applyEvent('TaskPlan'));
    expect(execute).toHaveBeenCalledWith(
      'goal-1',
      'kr-1',
      expect.objectContaining({
        note: '任务计划完成: Write tests',
        source: { type: 'TASK_TEMPLATE', id: 'template-1' },
      }),
      'identity-1',
    );
  });

  it('rejects delivery so the outbox remains retryable when Goal returns an error', async () => {
    const execute = vi.fn(async () => error('NOT_FOUND', 'Goal not found'));
    await expect(handler({ create: execute }).handle(applyEvent())).rejects.toThrow(
      'Task -> Goal delivery failed (NOT_FOUND)',
    );
  });

  it('reverts only the explicit sources carried by V2', async () => {
    const remove = vi.fn(async () => ok({} as never));
    const execute = vi.fn(async () => ok({} as never));
    await handler({ remove, create: execute }).handle(revertEvent());
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith('identity-1', 'TASK_INSTANCE', 'instance-1');
    expect(remove).toHaveBeenCalledWith('identity-1', 'TASK_TEMPLATE', 'template-1');
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps the outbox retryable when explicit-source removal fails', async () => {
    const remove = vi.fn(async () => error('NOT_FOUND', 'Record missing'));
    await expect(handler({ remove }).handle(revertEvent())).rejects.toThrow(
      'Task -> Goal removal failed (NOT_FOUND)',
    );
  });
});
