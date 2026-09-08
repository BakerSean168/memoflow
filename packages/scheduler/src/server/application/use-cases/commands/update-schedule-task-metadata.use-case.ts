import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { ScheduleTaskClientDTO, UpdateTaskMetadataRequest } from '@memoflow/contracts/schedule';
import type { IScheduleTaskRepository } from '../../../domain';

/**
 * Update Schedule Task Metadata Use Case
 * 更新调度任务元数据用例
 */
export class UpdateScheduleTaskMetadataUseCase {
  constructor(private readonly scheduleTaskRepository: IScheduleTaskRepository) {}

  async execute(
    id: string,
    identityId: string,
    metadata: UpdateTaskMetadataRequest,
  ): Promise<Result<ScheduleTaskClientDTO>> {
    const task = await this.scheduleTaskRepository.findByIdForIdentity(identityId, id);
    if (!task) {
      return error('NOT_FOUND', `Schedule task ${id} not found`);
    }

    task.updateMetadata(metadata);
    await this.scheduleTaskRepository.save(task);

    return ok(task.toClientDTO());
  }
}
