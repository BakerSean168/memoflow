/**
 * Get Schedule Task Use Case
 * 获取调度任务用例
 *
 * 【应用服务职责】
 * - 查询任务
 * - DTO 转换
 */

import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import type { IScheduleTaskRepository } from '../../../domain';
import type { ScheduleTaskClientDTO } from '@memoflow/contracts/schedule';

/**
 * Get Schedule Task Use Case
 *
 * 【执行流程】
 * 1. 查询任务
 * 2. 转换为 Client DTO
 */
export class GetScheduleTaskUseCase {
  constructor(
    private readonly scheduleTaskRepository: IScheduleTaskRepository,
  ) {}

  async execute(id: string, identityId: string): Promise<Result<ScheduleTaskClientDTO | null>> {
    // 1. 查询任务
    const task = await this.scheduleTaskRepository.findByIdForIdentity(identityId, id);

    // 2. 转换为 Client DTO
    return ok(task ? task.toClientDTO() : null);
  }
}
