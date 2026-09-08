import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { ScheduleTaskClientDTO } from '@memoflow/contracts/schedule';
import type { IScheduleTaskRepository } from '../../../domain';

/**
 * Cancel Schedule Task Use Case
 * 取消调度任务用例
 */
export class CancelScheduleTaskUseCase {
  constructor(private readonly scheduleTaskRepository: IScheduleTaskRepository) {}

  async execute(id: string, identityId: string, reason: string): Promise<Result<ScheduleTaskClientDTO>> {
    const task = await this.scheduleTaskRepository.findByIdForIdentity(identityId, id);
    if (!task) {
      return error('NOT_FOUND', `Schedule task ${id} not found`);
    }

    task.cancel(reason);
    await this.scheduleTaskRepository.save(task);

    return ok(task.toClientDTO());
  }
}
