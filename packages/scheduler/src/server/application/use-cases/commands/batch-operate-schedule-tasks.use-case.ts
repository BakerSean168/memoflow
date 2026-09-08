import type {
  BatchScheduleTaskOperationRequest,
  ScheduleTaskClientDTO,
} from '@memoflow/contracts/schedule';
import type { Result } from '@memoflow/contracts/result';
import { ok, isOk } from '@memoflow/contracts/result';
import { CancelScheduleTaskUseCase } from './cancel-schedule-task.use-case';
import { PauseScheduleTaskUseCase } from './pause-schedule-task.use-case';
import { ResumeScheduleTaskUseCase } from './resume-schedule-task.use-case';
import { UpdateScheduleTaskUseCase } from './update-schedule-task.use-case';
import type { BatchScheduleTaskResult } from './batch-delete-schedule-tasks.use-case';

interface BatchOperateDependencies {
  pauseScheduleTask: PauseScheduleTaskUseCase;
  resumeScheduleTask: ResumeScheduleTaskUseCase;
  cancelScheduleTask: CancelScheduleTaskUseCase;
  updateScheduleTask: UpdateScheduleTaskUseCase;
}

/**
 * Batch Operate Schedule Tasks Use Case
 * 批量操作调度任务用例
 */
export class BatchOperateScheduleTasksUseCase {
  constructor(private readonly deps: BatchOperateDependencies) {}

  async execute(
    request: BatchScheduleTaskOperationRequest,
    identityId: string,
  ): Promise<Result<BatchScheduleTaskResult>> {
    const results: BatchScheduleTaskResult = {
      success: [],
      failed: [],
      total: request.taskIds.length,
      successCount: 0,
      failedCount: 0,
    };

    for (const taskId of request.taskIds) {
      const result = await this.executeSingle(taskId, request, identityId);
      if (isOk(result)) {
        results.success.push(taskId);
      } else {
        results.failed.push({
          taskId,
          error: result.error.message,
        });
      }
    }

    results.successCount = results.success.length;
    results.failedCount = results.failed.length;

    return ok(results);
  }

  private executeSingle(
    taskId: string,
    request: BatchScheduleTaskOperationRequest,
    identityId: string,
  ): Promise<Result<ScheduleTaskClientDTO>> {
    switch (request.operation) {
      case 'pause':
        return this.deps.pauseScheduleTask.execute(taskId, identityId);
      case 'resume':
        return this.deps.resumeScheduleTask.execute(taskId, identityId);
      case 'cancel':
        return this.deps.cancelScheduleTask.execute(taskId, identityId, request.reason ?? 'Batch cancelled');
      case 'enable':
        return this.deps.updateScheduleTask.execute({ id: taskId, enabled: true }, identityId);
      case 'disable':
        return this.deps.updateScheduleTask.execute({ id: taskId, enabled: false }, identityId);
    }
  }
}
