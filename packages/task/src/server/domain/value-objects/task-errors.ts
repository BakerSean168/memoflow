/**
 * Task Module - Domain Errors
 * 任务模块领域错误
 */

import { ResultErrorException } from '@memoflow/contracts/result';

/**
 * 任务模板未找到错误
 */
export class TaskPlanNotFoundError extends ResultErrorException {
  constructor(templateId: string) {
    super(`任务模板未找到：${templateId}`, 'task_template_not_found', undefined, undefined, 400);
  }
}

/**
 * 任务模板状态无效错误
 */
export class InvalidTaskPlanStateError extends ResultErrorException {
  constructor(message: string, context?: { templateId?: string; currentStatus?: string; attemptedAction?: string }) {
    const contextStr = context ? ` (templateId: ${context.templateId}, status: ${context.currentStatus}, action: ${context.attemptedAction})` : '';
    super(
      `${message}${contextStr}`,
      'invalid_task_template_state',
      undefined,
      undefined,
      400,
    );
  }
}

/**
 * 任务模板已归档错误
 */
export class TaskPlanArchivedError extends ResultErrorException {
  constructor(templateId: string) {
    super(`任务模板已归档：${templateId}`, 'task_template_archived', undefined, undefined, 400);
  }
}

/**
 * 重复规则未实现错误
 */
export class RecurrenceRuleNotImplementedError extends ResultErrorException {
  constructor(ruleType: string) {
    super(
      `重复规则未实现：${ruleType}`,
      'recurrence_rule_not_implemented',
      undefined,
      undefined,
      400,
    );
  }
}

/**
 * 目标绑定无效错误
 */
export class InvalidGoalBindingError extends ResultErrorException {
  constructor(reason: string) {
    super(`目标绑定无效：${reason}`, 'invalid_goal_binding', undefined, undefined, 400);
  }
}

/**
 * 日期范围无效错误
 */
export class InvalidDateRangeError extends ResultErrorException {
  constructor(startDate: Date | number, endDate: Date | number) {
    const start = typeof startDate === 'number' ? new Date(startDate) : startDate;
    const end = typeof endDate === 'number' ? new Date(endDate) : endDate;
    super(
      `日期范围无效：开始日期 ${start.toISOString()} 晚于结束日期 ${end.toISOString()}`,
      'invalid_date_range',
      undefined,
      undefined,
      400,
    );
  }
}

/**
 * 实例生成失败错误
 */
export class InstanceGenerationFailedError extends ResultErrorException {
  constructor(templateId: string, reason?: string) {
    super(
      `任务实例生成失败：${templateId}${reason ? ` - ${reason}` : ''}`,
      'instance_generation_failed',
      undefined,
      undefined,
      400,
    );
  }
}

/**
 * 任务实例未找到错误
 */
export class TaskOccurrenceNotFoundError extends ResultErrorException {
  constructor(instanceId: string) {
    super(`任务实例未找到：${instanceId}`, 'task_instance_not_found', undefined, undefined, 400);
  }
}

/**
 * 任务实例已完成错误
 */
export class TaskOccurrenceAlreadyCompletedError extends ResultErrorException {
  constructor(instanceId: string) {
    super(
      `任务实例已完成：${instanceId}`,
      'task_instance_already_completed',
      undefined,
      undefined,
      400,
    );
  }
}
