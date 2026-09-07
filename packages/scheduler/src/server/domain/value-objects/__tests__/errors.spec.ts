import { describe, expect, it } from 'vitest';
import {
  ScheduleStrategyNotFoundError,
  ScheduleTaskUpdateError,
  ScheduleTaskCreationError,
  ScheduleTaskDisabledError,
  ScheduleTaskInvalidStatusError,
  ScheduleTaskNotFoundError,
  SourceEntityNoScheduleRequiredError,
} from '../errors';

describe('schedule domain errors', () => {
  it('captures module context for missing strategies', () => {
    const error = new ScheduleStrategyNotFoundError('Task', {
      availableModules: ['Goal'],
      operationId: 'op-1',
    });

    expect(error.code).toBe('schedule_strategy_not_found');
    expect(error.context?.operationId).toBe('op-1');
  });

  it('formats task lifecycle error messages', () => {
    expect(new ScheduleTaskNotFoundError('task-1').message).toContain('task-1');
    expect(new ScheduleTaskDisabledError('task-2').message).toContain('task-2');
    expect(new ScheduleTaskInvalidStatusError('task-3', 'Paused').message).toContain('Paused');
  });

  it('preserves original errors during task creation failures', () => {
    const cause = new Error('boom');
    const error = new ScheduleTaskCreationError('Reminder', 'entity-1', cause);

    expect(error.code).toBe('schedule_task_creation_error');
    expect(error.cause).toBe(cause);
    expect(error.message).toContain('boom');
  });

  it('formats source-entity and update failures with optional reasons', () => {
    const noSchedule = new SourceEntityNoScheduleRequiredError('Goal', 'entity-2', 'manual only');
    const update = new ScheduleTaskUpdateError('task-9', new Error('version mismatch'));

    expect(noSchedule.message).toContain('manual only');
    expect(update.code).toBe('schedule_task_update_error');
    expect(update.message).toContain('version mismatch');
  });
});
