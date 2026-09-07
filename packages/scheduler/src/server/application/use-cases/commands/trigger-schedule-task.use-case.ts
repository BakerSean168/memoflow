/**
 * Trigger Schedule Task Use Case
 * 手动触发调度任务用例
 *
 * 【应用服务职责】
 * - 查询任务
 * - 触发任务执行
 * - 重新计算下次运行时间
 */

import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { IScheduleTaskRepository } from '../../../domain';

/**
 * Trigger Schedule Task Use Case
 *
 * 【执行流程】
 * 1. 查询任务
 * 2. 触发执行（连接到执行引擎）
 * 3. 重新计算下次运行时间
 * 4. 持久化
 */
export class TriggerScheduleTaskUseCase {
  constructor(
    private readonly scheduleTaskRepository: IScheduleTaskRepository,
  ) {}

  async execute(id: string, identityId: string): Promise<Result<void>> {
    // 1. 查询任务
    const task = await this.scheduleTaskRepository.findByIdForIdentity(identityId, id);
    if (!task) {
      return error('NOT_FOUND', `Schedule task ${id} not found`);
    }

    // 2. 触发执行
    // 注意：实际的执行逻辑由执行引擎/调度器管理
    // 此处仅重新计算下次运行时间
    task.calculateNextRun();

    // 3. 持久化
    await this.scheduleTaskRepository.save(task);

    return ok(undefined);
  }
}
