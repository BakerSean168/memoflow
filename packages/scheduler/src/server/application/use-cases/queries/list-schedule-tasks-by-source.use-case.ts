/**
 * List Schedule Tasks By Source Use Case
 * 按源实体列出调度任务用例
 *
 * 【应用服务职责】
 * - 查询任务列表
 * - DTO 转换
 */

import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import type { IScheduleTaskRepository } from '../../../domain';
import type { ScheduleTaskClientDTO, SourceModule } from '@memoflow/contracts/schedule';

/**
 * List Schedule Tasks By Source Use Case
 *
 * 【执行流程】
 * 1. 查询指定源模块和源实体的所有任务
 * 2. 转换为 Client DTO 列表
 */
export class ListScheduleTasksBySourceUseCase {
  constructor(
    private readonly scheduleTaskRepository: IScheduleTaskRepository,
  ) {}

  async execute(
    sourceModule: SourceModule,
    sourceId: string,
    identityId: string,
  ): Promise<Result<ScheduleTaskClientDTO[]>> {
    // 1. 查询指定源、当前 identity 的任务
    const tasks = await this.scheduleTaskRepository.findBySourceEntity(
      sourceModule,
      sourceId,
      identityId,
    );

    // 2. 转换为 Client DTO 列表
    return ok(tasks.map((t) => t.toClientDTO()));
  }
}
