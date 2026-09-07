/**
 * Resume Schedule Task Use Case
 * 恢复调度任务用例
 *
 * 【应用服务职责】
 * - 查询任务
 * - 调用聚合根的恢复方法
 * - 持久化状态变更
 */

import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { IScheduleTaskRepository } from '../../../domain';
import type { ScheduleTaskClientDTO } from '@memoflow/contracts/schedule';

/**
 * Resume Schedule Task Use Case
 *
 * 【执行流程】
 * 1. 查询任务
 * 2. 调用聚合根的 enable 方法
 * 3. 持久化
 * 4. 返回 DTO
 */
export class ResumeScheduleTaskUseCase {
  constructor(
    private readonly scheduleTaskRepository: IScheduleTaskRepository,
  ) {}

  async execute(id: string, identityId: string): Promise<Result<ScheduleTaskClientDTO>> {
    // 1. 查询任务
    const task = await this.scheduleTaskRepository.findByIdForIdentity(identityId, id);
    if (!task) {
      return error('NOT_FOUND', `Schedule task ${id} not found`);
    }

    task.resume();

    // 3. 持久化
    await this.scheduleTaskRepository.save(task);

    // 4. 返回 DTO
    return ok(task.toClientDTO());
  }
}
