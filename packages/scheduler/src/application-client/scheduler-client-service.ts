import type { Result } from '@memoflow/contracts/result';
import { map as mapResult } from '@memoflow/contracts/result';
import type {
  ScheduleExecutionClientDTO,
  ScheduleTaskClientDTO,
  SourceModule,
} from '@memoflow/contracts/schedule';
import { IdentityId } from '@memoflow/domain-shared';
import type { IScheduleTaskApiClient } from './ports/schedule-task-api-client.port';
import {
  ExecutionInfoVO,
  RetryPolicyVO,
  ScheduleConfigVO,
  ScheduleTask,
  TaskMetadataVO,
} from '../domain-client/aggregates/schedule-task';
import { ScheduleExecution } from '../domain-client/entities/schedule-execution';
import { ScheduleExecutionId } from '../server/domain/value-objects/schedule-execution-id';
import { ScheduleTaskId } from '../server/domain/value-objects/schedule-task-id';
import type { SchedulerClientPort } from './scheduler-client.port';

function scheduleExecutionFromDTO(dto: ScheduleExecutionClientDTO): ScheduleExecution {
  return ScheduleExecution.load({
    id: ScheduleExecutionId.of(dto.id),
    scheduleTaskId: ScheduleTaskId.of(dto.scheduleTaskId),
    executionTime: new Date(dto.executionTime),
    status: dto.status,
    duration: dto.duration,
    result: dto.result,
    error: dto.error,
    retryCount: dto.retryCount,
    version: dto.version,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
    deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
  });
}

function scheduleTaskFromDTO(dto: ScheduleTaskClientDTO): ScheduleTask {
  return ScheduleTask.load({
    id: ScheduleTaskId.of(dto.id),
    identityId: IdentityId.of(dto.identityId),
    name: dto.name,
    description: dto.description,
    sourceModule: dto.sourceModule,
    sourceEntityId: dto.sourceEntityId,
    status: dto.status,
    enabled: dto.enabled,
    schedule: new ScheduleConfigVO(dto.schedule),
    execution: new ExecutionInfoVO(dto.execution),
    retryPolicy: new RetryPolicyVO(dto.retryPolicy),
    metadata: new TaskMetadataVO(dto.metadata),
    version: dto.version,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
    deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
    executions: dto.executions?.map(scheduleExecutionFromDTO) ?? null,
  });
}

export class SchedulerClientService implements SchedulerClientPort {
  constructor(private readonly taskApi: IScheduleTaskApiClient) {}

  async getTasks(): Promise<Result<ScheduleTask[]>> {
    return mapResult(await this.taskApi.getTasks(), (dtos) => dtos.map(scheduleTaskFromDTO));
  }

  async getTaskById(taskId: string): Promise<Result<ScheduleTask>> {
    return mapResult(await this.taskApi.getTaskById(taskId), scheduleTaskFromDTO);
  }

  async getDueTasks(params?: {
    beforeTime?: string;
    limit?: number;
  }): Promise<Result<ScheduleTask[]>> {
    return mapResult(await this.taskApi.getDueTasks(params), (dtos) => dtos.map(scheduleTaskFromDTO));
  }

  async getTaskBySource(
    sourceModule: SourceModule,
    sourceEntityId: string,
  ): Promise<Result<ScheduleTask[]>> {
    return mapResult(
      await this.taskApi.getTaskBySource(sourceModule, sourceEntityId),
      (dtos) => dtos.map(scheduleTaskFromDTO),
    );
  }
}

export function createSchedulerClientService(
  taskApi: IScheduleTaskApiClient,
): SchedulerClientService {
  return new SchedulerClientService(taskApi);
}
