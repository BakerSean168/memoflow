import {
  InstanceGenerationFailedError,
  InvalidDateRangeError,
  InvalidGoalBindingError,
  InvalidTaskPlanStateError,
  RecurrenceRuleNotImplementedError,
  TaskOccurrenceAlreadyCompletedError,
  TaskOccurrenceNotFoundError,
  TaskPlanArchivedError,
  TaskPlanNotFoundError,
} from '../task-errors';
import { SkipRecord } from '../skip-record';

describe('task server value objects', () => {
  it('serializes skip records across dto formats', () => {
    const record = SkipRecord.create({
      skippedAt: Date.UTC(2026, 3, 26, 9, 0, 0),
      reason: 'manual skip',
    });

    expect(record.skippedAt).toBe(Date.UTC(2026, 3, 26, 9, 0, 0));
    expect(record.reason).toBe('manual skip');
    expect(SkipRecord.fromDTO(record.toDTO()).toDTO()).toEqual(record.toDTO());
    expect(SkipRecord.fromPersistence(record.toPersistence()).toPersistence()).toEqual(
      record.toPersistence(),
    );
  });

  it('builds domain errors with stable codes and messages', () => {
    expect(new TaskPlanNotFoundError('tpl-1')).toMatchObject({
      code: 'task_template_not_found',
      message: '任务模板未找到：tpl-1',
    });
    expect(new TaskPlanArchivedError('tpl-2')).toMatchObject({
      code: 'task_template_archived',
      message: '任务模板已归档：tpl-2',
    });
    expect(new RecurrenceRuleNotImplementedError('Custom')).toMatchObject({
      code: 'recurrence_rule_not_implemented',
      message: '重复规则未实现：Custom',
    });
    expect(new InvalidGoalBindingError('missing key result')).toMatchObject({
      code: 'invalid_goal_binding',
      message: '目标绑定无效：missing key result',
    });
    expect(new TaskOccurrenceNotFoundError('instance-1')).toMatchObject({
      code: 'task_instance_not_found',
      message: '任务实例未找到：instance-1',
    });
    expect(new TaskOccurrenceAlreadyCompletedError('instance-2')).toMatchObject({
      code: 'task_instance_already_completed',
      message: '任务实例已完成：instance-2',
    });
    expect(new InstanceGenerationFailedError('tpl-3', 'cycle detected')).toMatchObject({
      code: 'instance_generation_failed',
      message: '任务实例生成失败：tpl-3 - cycle detected',
    });

    const invalidState = new InvalidTaskPlanStateError('invalid transition', {
      templateId: 'tpl-4',
      currentStatus: 'Paused',
      attemptedAction: 'archive',
    });
    expect(invalidState.code).toBe('invalid_task_template_state');
    expect(invalidState.message).toContain('invalid transition');
    expect(invalidState.message).toContain('templateId: tpl-4');
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
