/**
 * Schedule Client Service
 *
 * Constructor-injected product service for calendar management plus read-only
 * Scheduler worker diagnostics. Raw ScheduleTask mutation is intentionally not
 * part of this client surface.
 */

import type { Result } from '@memoflow/contracts/result';
import { map as mapResult } from '@memoflow/contracts/result';
import type {
  CalendarEntryClientDTO,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  GetSchedulesByTimeRangeRequest,
  ConflictDetectionResult,
  ResolveConflictRequest,
  SourceModule,
  ScheduleTaskClientDTO,
  ScheduleExecutionClientDTO,
} from '@memoflow/contracts/schedule';
import type { IScheduleEventApiClient } from './ports/schedule-event-api-client.port';
import type { IScheduleTaskApiClient } from './ports/schedule-task-api-client.port';
import {
  ScheduleTask,
  ScheduleConfigVO,
  ExecutionInfoVO,
  RetryPolicyVO,
  TaskMetadataVO,
} from '../domain-client/aggregates/schedule-task';
import { ScheduleExecution } from '../domain-client/entities/schedule-execution';
import { ScheduleTaskId } from '../server/domain/value-objects/schedule-task-id';
import { ScheduleExecutionId } from '../server/domain/value-objects/schedule-execution-id';
import { IdentityId } from '@memoflow/domain-shared';
import type { ScheduleClientPort } from './schedule-client.port';

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
    executions: dto.executions ? dto.executions.map((e) => scheduleExecutionFromDTO(e)) : null,
  });
}

export class ScheduleClientService implements ScheduleClientPort {
  constructor(
    private readonly eventApi: IScheduleEventApiClient,
    private readonly taskApi: IScheduleTaskApiClient,
  ) {
    this.createSchedule = this.createSchedule.bind(this);
    this.getSchedule = this.getSchedule.bind(this);
    this.getSchedulesByAccount = this.getSchedulesByAccount.bind(this);
    this.getSchedulesByTimeRange = this.getSchedulesByTimeRange.bind(this);
    this.updateSchedule = this.updateSchedule.bind(this);
    this.deleteSchedule = this.deleteSchedule.bind(this);
    this.getScheduleConflicts = this.getScheduleConflicts.bind(this);
    this.detectConflicts = this.detectConflicts.bind(this);
    this.createScheduleWithConflictDetection = this.createScheduleWithConflictDetection.bind(this);
    this.resolveConflict = this.resolveConflict.bind(this);
    this.getTasks = this.getTasks.bind(this);
    this.getTaskById = this.getTaskById.bind(this);
    this.getDueTasks = this.getDueTasks.bind(this);
    this.getTaskBySource = this.getTaskBySource.bind(this);
  }

  async createSchedule(data: CreateScheduleRequest): Promise<Result<CalendarEntryClientDTO>> {
    return this.eventApi.createSchedule(data);
  }

  async getSchedule(id: string): Promise<Result<CalendarEntryClientDTO>> {
    return this.eventApi.getSchedule(id);
  }

  async getSchedulesByAccount(): Promise<Result<CalendarEntryClientDTO[]>> {
    return this.eventApi.getSchedulesByAccount();
  }

  async getSchedulesByTimeRange(
    params: GetSchedulesByTimeRangeRequest,
  ): Promise<Result<CalendarEntryClientDTO[]>> {
    return this.eventApi.getSchedulesByTimeRange(params);
  }

  async updateSchedule(
    id: string,
    data: UpdateScheduleRequest,
  ): Promise<Result<CalendarEntryClientDTO>> {
    return this.eventApi.updateSchedule(id, data);
  }

  async deleteSchedule(id: string, expectedVersion: number): Promise<Result<void>> {
    return this.eventApi.deleteSchedule(id, expectedVersion);
  }

  async getScheduleConflicts(id: string): Promise<Result<ConflictDetectionResult>> {
    return this.eventApi.getScheduleConflicts(id);
  }

  async detectConflicts(params: {
    startTime: number;
    endTime: number;
    excludeId?: string;
  }): Promise<Result<ConflictDetectionResult>> {
    return this.eventApi.detectConflicts(params);
  }

  async createScheduleWithConflictDetection(
    request: CreateScheduleRequest,
  ): Promise<Result<{ schedule: CalendarEntryClientDTO; conflicts?: ConflictDetectionResult }>> {
    return this.eventApi.createScheduleWithConflictDetection(request);
  }

  async resolveConflict(
    scheduleId: string,
    request: ResolveConflictRequest,
  ): Promise<
    Result<{
      schedule: CalendarEntryClientDTO;
      conflicts: ConflictDetectionResult;
      applied: {
        strategy: string;
        previousStartTime?: number;
        previousEndTime?: number;
        changes: string[];
      };
    }>
  > {
    return this.eventApi.resolveConflict(scheduleId, request);
  }

  async getTasks(): Promise<Result<ScheduleTask[]>> {
    const result = await this.taskApi.getTasks();
    return mapResult(result, (dtos) => dtos.map((dto) => scheduleTaskFromDTO(dto)));
  }

  async getTaskById(taskId: string): Promise<Result<ScheduleTask>> {
    const result = await this.taskApi.getTaskById(taskId);
    return mapResult(result, (dto) => scheduleTaskFromDTO(dto));
  }

  async getDueTasks(params?: {
    beforeTime?: string;
    limit?: number;
  }): Promise<Result<ScheduleTask[]>> {
    const result = await this.taskApi.getDueTasks(params);
    return mapResult(result, (dtos) => dtos.map((dto) => scheduleTaskFromDTO(dto)));
  }

  async getTaskBySource(
    sourceModule: SourceModule,
    sourceEntityId: string,
  ): Promise<Result<ScheduleTask[]>> {
    const result = await this.taskApi.getTaskBySource(sourceModule, sourceEntityId);
    return mapResult(result, (dtos) => dtos.map((dto) => scheduleTaskFromDTO(dto)));
  }
}

export function createScheduleClientService(
  eventApi: IScheduleEventApiClient,
  taskApi: IScheduleTaskApiClient,
): ScheduleClientService {
  return new ScheduleClientService(eventApi, taskApi);
}
