import {
  OccurrenceGenerationFailedError,
  InvalidDateRangeError,
  InvalidGoalBindingError,
  InvalidTaskPlanStateError,
  TaskOccurrenceAlreadyCompletedError,
  TaskOccurrenceNotFoundError,
  TaskPlanArchivedError,
  TaskPlanNotFoundError,
} from '../task-errors';

describe('task server value objects', () => {
  it('builds domain errors with stable codes and messages', () => {
    expect(new TaskPlanNotFoundError('tpl-1')).toMatchObject({
      code: 'task_plan_not_found',
      message: '任务模板未找到：tpl-1',
    });
    expect(new TaskPlanArchivedError('tpl-2')).toMatchObject({
      code: 'task_plan_archived',
      message: '任务模板已归档：tpl-2',
    });
    expect(new InvalidGoalBindingError('missing key result')).toMatchObject({
      code: 'invalid_goal_binding',
      message: '目标绑定无效：missing key result',
    });
    expect(new TaskOccurrenceNotFoundError('occurrence-1')).toMatchObject({
      code: 'task_occurrence_not_found',
      message: '任务实例未找到：occurrence-1',
    });
    expect(new TaskOccurrenceAlreadyCompletedError('occurrence-2')).toMatchObject({
      code: 'task_occurrence_already_completed',
      message: '任务实例已完成：occurrence-2',
    });
    expect(new OccurrenceGenerationFailedError('tpl-3', 'cycle detected')).toMatchObject({
      code: 'occurrence_generation_failed',
      message: '任务实例生成失败：tpl-3 - cycle detected',
    });

    const invalidState = new InvalidTaskPlanStateError('invalid transition', {
      planId: 'tpl-4',
      currentStatus: 'Paused',
      attemptedAction: 'archive',
    });
    expect(invalidState.code).toBe('invalid_task_plan_state');
    expect(invalidState.message).toContain('invalid transition');
    expect(invalidState.message).toContain('planId: tpl-4');
    expect(invalidState.message).toContain('status: Paused');
    expect(invalidState.message).toContain('action: archive');

    const invalidRange = new InvalidDateRangeError(
      Date.UTC(2026, 3, 27, 0, 0, 0),
      Date.UTC(2026, 3, 26, 0, 0, 0),
    );
    expect(invalidRange.code).toBe('invalid_date_range');
    expect(invalidRange.message).toContain('开始日期 2026-04-27T00:00:00.000Z');
    expect(invalidRange.message).toContain('结束日期 2026-04-26T00:00:00.000Z');
  });
});
