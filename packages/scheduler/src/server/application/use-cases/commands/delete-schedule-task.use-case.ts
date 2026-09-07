/**
 * Delete Schedule Task Use Case
 * 删除调度任务用例
 *
 * 【应用服务职责】
 * - 查询任务是否存在
 * - 执行删除操作
 * - 事务协调
 */

import type { ScheduleEventMap } from '@memoflow/contracts/schedule';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { IScheduleTaskRepository } from '../../../domain';
import { createTypedEventPublisher, eventBus } from '@memoflow/utils/domain';

const scheduleEvents = createTypedEventPublisher<Pick<ScheduleEventMap, 'schedule:task-deleted'>>(
  eventBus,
);

/**
 * Delete Schedule Task Use Case
 *
 * 【执行流程】
 * 1. 验证任务存在
 * 2. 执行删除
 */
export class DeleteScheduleTaskUseCase {
  constructor(
    private readonly scheduleTaskRepository: IScheduleTaskRepository,
  ) {}

  async execute(id: string, identityId: string): Promise<Result<void>> {
    // 1. 验证任务存在
    const task = await this.scheduleTaskRepository.findByIdForIdentity(identityId, id);
    if (!task) {
      return error('NOT_FOUND', `Schedule task ${id} not found`);
    }

    // 2. 执行删除（硬删除或软删除取决于业务需求）
    await this.scheduleTaskRepository.deleteById(identityId, id);
    scheduleEvents.send('schedule:task-deleted', { taskId: id });

    return ok(undefined);
  }
}
