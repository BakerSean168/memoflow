/**
 * Schedule Module - Domain Errors
 * 调度模块领域错误
 */

import { ResultErrorException } from '@memoflow/contracts/result';
import type { SourceModule } from '@memoflow/contracts/schedule';

/**
 * 调度策略未找到错误
 */
export class ScheduleStrategyNotFoundError extends ResultErrorException {
  constructor(
    public readonly sourceModule: SourceModule,
    context?: {
      availableModules?: SourceModule[];
      operationId?: string;
    },
  ) {
    super(
      `调度策略未找到：${sourceModule}`,
      'schedule_strategy_not_found',
      undefined,
      context,
      400,
    );
  }
}

/**
 * 源实体不需要调度错误
 */
export class SourceEntityNoScheduleRequiredError extends ResultErrorException {
  constructor(
    public readonly sourceModule: SourceModule,
    public readonly sourceEntityId: string,
    public readonly reason?: string,
  ) {
    super(
      `源实体不需要调度：${sourceModule}/${sourceEntityId}${reason ? ` (${reason})` : ''}`,
      'source_entity_no_schedule_required',
      undefined,
      undefined,
      400,
    );
  }
}

/**
 * 调度任务创建失败错误
 */
export class ScheduleTaskCreationError extends ResultErrorException {
  constructor(
    public readonly sourceModule: SourceModule,
    public readonly sourceEntityId: string,
    originalError?: Error,
  ) {
    super(
      `调度任务创建失败：${sourceModule}/${sourceEntityId}${originalError ? ` - ${originalError.message}` : ''}`,
      'schedule_task_creation_error',
      undefined,
      undefined,
      400,
      originalError,
    );
  }
}

/**
 * 调度任务更新失败错误
 */
export class ScheduleTaskUpdateError extends ResultErrorException {
  constructor(
    public readonly taskId: string,
    originalError?: Error,
  ) {
    super(
      `调度任务更新失败：${taskId}${originalError ? ` - ${originalError.message}` : ''}`,
      'schedule_task_update_error',
      undefined,
      undefined,
      400,
      originalError,
    );
  }
}

/**
 * 调度任务未找到错误
 */
export class ScheduleTaskNotFoundError extends ResultErrorException {
  constructor(taskId: string) {
    super(`调度任务未找到：${taskId}`, 'schedule_task_not_found', undefined, undefined, 400);
  }
}

/**
 * 调度任务已禁用错误
 */
export class ScheduleTaskDisabledError extends ResultErrorException {
  constructor(taskId: string) {
    super(`调度任务已禁用：${taskId}`, 'schedule_task_disabled', undefined, undefined, 400);
  }
}

/**
 * 调度任务状态无效错误
 */
export class ScheduleTaskInvalidStatusError extends ResultErrorException {
  constructor(taskId: string, currentStatus: string) {
    super(
      `调度任务状态无效：${taskId} (当前状态: ${currentStatus})`,
      'schedule_task_invalid_status',
      undefined,
      undefined,
      400,
    );
  }
}
