import { createLogger } from '@memoflow/utils/logger';
import { ScheduleTask } from '../../domain/aggregates/schedule-task';
import type { IScheduleTaskRepository } from '../../domain/repositories/i-schedule-task-repository';

const logger = createLogger('FindDueScheduleTasksUseCase');

/**
 * 查询所有到期的 ScheduleTask
 */
export class FindDueScheduleTasksUseCase {
  constructor(private readonly repository: IScheduleTaskRepository) {}

  async execute(beforeTime?: number): Promise<ScheduleTask[]> {
    const queryTime = beforeTime ?? Date.now();

    try {
      const tasks = await this.repository.findDueTasksForExecution(
        new Date(queryTime),
        100,
      );

      logger.info('查询到期任务', {
        queryTime: new Date(queryTime).toISOString(),
        foundCount: tasks.length,
      });

      return tasks;
    } catch (error) {
      logger.error('查询到期任务失败', { error });
      throw error;
    }
  }
}
