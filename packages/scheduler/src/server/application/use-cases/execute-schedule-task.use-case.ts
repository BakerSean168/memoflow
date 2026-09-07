import { ScheduleTask } from '../../domain/aggregates/schedule-task';
import type { IScheduleTaskRepository } from '../../domain/repositories/i-schedule-task-repository';
import type { IScheduleTaskMonitor } from './schedule-executor-helpers';

/**
 * 执行单个 ScheduleTask
 */
export class ExecuteScheduleTaskUseCase {
  constructor(
    private readonly repository: IScheduleTaskRepository,
    private readonly monitor: IScheduleTaskMonitor,
  ) {}

  async execute(task: ScheduleTask): Promise<void> {
    const taskId = task.id;
    const taskName = task.taskName;

    this.monitor.recordExecutionStart(taskId, taskName);

    try {
      const success = task.execute();

      if (!success) {
        throw new Error('Task execution returned false');
      }

      await this.repository.save(task);

      this.monitor.recordExecutionSuccess(taskId, taskName);
    } catch (error) {
      this.monitor.recordExecutionFailure(
        taskId,
        taskName,
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }
}
