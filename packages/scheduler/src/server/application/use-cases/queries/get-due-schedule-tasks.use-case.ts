import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import type { ScheduleTaskClientDTO } from '@memoflow/contracts/schedule';
import type { IScheduleTaskRepository } from '../../../domain';

/**
 * Get Due Schedule Tasks Use Case
 * 获取到期调度任务用例
 */
export class GetDueScheduleTasksUseCase {
  constructor(private readonly scheduleTaskRepository: IScheduleTaskRepository) {}

  async execute(beforeTime: Date = new Date()): Promise<Result<ScheduleTaskClientDTO[]>> {
    const tasks = await this.scheduleTaskRepository.findDueTasksForExecution(beforeTime);
    return ok(tasks.map((task) => task.toClientDTO()));
  }
}
