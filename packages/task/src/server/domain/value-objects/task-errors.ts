/**
 * Task Module - Domain Errors
 * 任务模块领域错误
 */

import { ResultErrorException } from '@memoflow/contracts/result';

/**
 * 任务模板未找到错误
 */
export class TaskPlanNotFoundError extends ResultErrorException {
  constructor(planId: string) {
    super(`任务模板未找到：${planId}`, 'task_plan_not_found', undefined, undefined, 400);
  }
}

/**
 * 任务模板状态无效错误
 */
export class InvalidTaskPlanStateError extends ResultErrorException {
  constructor(message: string, context?: { planId?: string; currentStatus?: string; attemptedAction?: string }) {
    const contextStr = context ? ` (planId: ${context.planId}, status: ${context.currentStatus}, action: ${context.attemptedAction})` : '';
    super(
      `${message}${contextStr}`,
      'invalid_task_plan_state',
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
  constructor(planId: string) {
    super(`任务模板已归档：${planId}`, 'task_plan_archived', undefined, undefined, 400);
  }
}

/**
 * 检查清单项 ID 重复错误（定义 ID 是稳定身份，见 ADR-073）
 */
export class DuplicateChecklistItemIdError extends ResultErrorException {
  constructor(duplicateId: string) {
    super(
      `检查清单项 ID 重复：${duplicateId}`,
      'duplicate_checklist_item_id',
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
export class OccurrenceGenerationFailedError extends ResultErrorException {
  constructor(planId: string, reason?: string) {
    super(
      `任务实例生成失败：${planId}${reason ? ` - ${reason}` : ''}`,
      'occurrence_generation_failed',
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
  constructor(occurrenceId: string) {
    super(`任务实例未找到：${occurrenceId}`, 'task_occurrence_not_found', undefined, undefined, 400);
  }
}

/**
 * 任务实例已完成错误
 */
export class TaskOccurrenceAlreadyCompletedError extends ResultErrorException {
  constructor(occurrenceId: string) {
    super(
      `任务实例已完成：${occurrenceId}`,
      'task_occurrence_already_completed',
      undefined,
      undefined,
      400,
    );
  }
}
