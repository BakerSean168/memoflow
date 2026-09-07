import type { Result } from '@memoflow/contracts/result';
import { ok, isOk } from '@memoflow/contracts/result';
import { DeleteScheduleTaskUseCase } from './delete-schedule-task.use-case';

export interface BatchScheduleTaskResult {
  success: string[];
  failed: Array<{ taskId: string; error: string }>;
  total: number;
  successCount: number;
  failedCount: number;
}

/**
 * Batch Delete Schedule Tasks Use Case
 * 批量删除调度任务用例
 */
export class BatchDeleteScheduleTasksUseCase {
  constructor(private readonly deleteScheduleTask: DeleteScheduleTaskUseCase) {}

  async execute(ids: readonly string[], identityId: string): Promise<Result<BatchScheduleTaskResult>> {
    const results: BatchScheduleTaskResult = {
      success: [],
      failed: [],
      total: ids.length,
      successCount: 0,
      failedCount: 0,
    };

    for (const id of ids) {
      const result = await this.deleteScheduleTask.execute(id, identityId);
      if (isOk(result)) {
        results.success.push(id);
      } else {
        results.failed.push({
          taskId: id,
          error: result.error.message,
        });
      }
    }

    results.successCount = results.success.length;
    results.failedCount = results.failed.length;

    return ok(results);
  }
}
