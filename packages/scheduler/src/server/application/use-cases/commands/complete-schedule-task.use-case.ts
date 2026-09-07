import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { ScheduleTaskClientDTO } from '@memoflow/contracts/schedule';
import type { IScheduleTaskRepository } from '../../../domain';

/**
 * Complete Schedule Task Use Case
 * 完成调度任务用例
 */
export class CompleteScheduleTaskUseCase {
  constructor(private readonly scheduleTaskRepository: IScheduleTaskRepository) {}

  async execute(id: string, identityId: string): Promise<Result<ScheduleTaskClientDTO>> {
    const task = await this.scheduleTaskRepository.findByIdForIdentity(identityId, id);
    if (!task) {
      return error('NOT_FOUND', `Schedule task ${id} not found`);
    }

    task.complete();
    await this.scheduleTaskRepository.save(task);

    return ok(task.toClientDTO());
  }
}
