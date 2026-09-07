/**
 * Create Schedule Task Use Case
 * 创建调度任务用例
 *
 * 【应用服务职责】
 * - 协调领域服务创建任务
 * - DTO 转换
 * - 事务协调
 *
 * 【不包含】
 * - 业务规则（由领域服务和聚合根处理）
 * - 持久化细节（由仓储处理）
 */

import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import {
  type IScheduleTaskRepository,
  ScheduleTask,
} from '../../../domain';
import type {
  ScheduleTaskClientDTO,
  ScheduleConfigDTO,
  RetryPolicyDTO,
  SourceModule,
} from '@memoflow/contracts/schedule';
import { RetryPolicy, ScheduleConfig, ScheduleTaskMetadata } from '../../../domain/value-objects';

/**
 * 创建调度任务的请求参数
 */
export interface CreateScheduleTaskReq {
  name: string;
  sourceModule: SourceModule;
  sourceId: string;
  scheduleConfig: ScheduleConfigDTO;
  handlerType: string;
  handlerPayload?: unknown;
  priority?: number;
  retryPolicy?: Partial<RetryPolicyDTO>;
  enabled?: boolean;
  description?: string;
  identityId: string;
}

/**
 * Create Schedule Task Use Case
 *
 * 【执行流程】
 * 1. 调用领域服务创建调度任务聚合根
 * 2. 持久化到仓储
 * 3. 转换为 Client DTO 返回
 */
export class CreateScheduleTaskUseCase {
  constructor(
    private readonly scheduleTaskRepository: IScheduleTaskRepository,
  ) {}

  async execute(req: CreateScheduleTaskReq): Promise<Result<ScheduleTaskClientDTO>> {
    const schedule = ScheduleConfig.fromDTO({
      ...req.scheduleConfig,
      startDate: req.scheduleConfig.startDate
        ? new Date(req.scheduleConfig.startDate).toISOString()
        : null,
      endDate: req.scheduleConfig.endDate
        ? new Date(req.scheduleConfig.endDate).toISOString()
        : null,
    });

    const retryPolicy = req.retryPolicy
      ? RetryPolicy.fromDTO({ ...RetryPolicy.createDefault().toDTO(), ...req.retryPolicy })
      : undefined;
    const metadata = req.handlerPayload
      ? ScheduleTaskMetadata.create({
          payload: req.handlerPayload as Record<string, unknown>,
          tags: [],
          priority: 'Normal',
          timeout: null,
        })
      : undefined;

    const task = ScheduleTask.create({
      name: req.name,
      description: req.description,
      identityId: req.identityId,
      sourceModule: req.sourceModule,
      sourceEntityId: req.sourceId,
      schedule,
      metadata,
      retryPolicy,
    });

    await this.scheduleTaskRepository.save(task);

    return ok(task.toClientDTO());
  }
}
