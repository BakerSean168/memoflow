import type {
  SourceModule,
  ScheduleTaskStatus,
  ExecutionStatus,
} from '@memoflow/contracts/schedule';
import { ScheduleTask } from '../../../../domain/aggregates/schedule-task';
import type { ScheduleTaskState } from '../../../../domain/aggregates/schedule-task';
import {
  ExecutionInfo,
  RetryPolicy,
  ScheduleConfig,
  ScheduleTaskMetadata,
  TaskPriority,
  Timezone,
} from '../../../../domain/value-objects';
import { ScheduleTaskId } from '../../../../domain/value-objects/schedule-task-id';
import type { IdentityId } from '@memoflow/domain-shared';
import { schedulingPersistenceMetadata } from '../../../scheduling/scheduling-persistence-metadata';
import {
  PowerSyncScheduleExecutionMapper,
  type PowerSyncScheduleExecutionRow,
} from './powersync-schedule-execution.mapper';

export type PowerSyncScheduleTaskRow = {
  id: string;
  identity_id: string;
  name: string;
  description: string | null;
  source_module: string;
  source_entity_id: string;
  scheduling_key: string | null;
  owner_type: string | null;
  owner_id: string | null;
  handler_key: string | null;
  payload_version: number | null;
  source_revision: string | null;
  status: string;
  enabled: number | boolean;
  cron_expression: string | null;
  timezone: string;
  start_date: string | null;
  end_date: string | null;
  max_executions: number | null;
  next_run_at: string | null;
  last_run_at: string | null;
  execution_count: number;
  last_execution_status: string | null;
  last_execution_duration: number | null;
  consecutive_failures: number;
  max_retries: number;
  initial_delay_ms: number | null;
  max_delay_ms: number | null;
  backoff_multiplier: number | null;
  retryable_statuses: string | null;
  payload: string | null;
  tags: string | null;
  priority: string | null;
  timeout: number | null;
  version: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export class PowerSyncScheduleTaskMapper {
  static toDomain(
    data: PowerSyncScheduleTaskRow,
    executions: PowerSyncScheduleExecutionRow[] = [],
  ): ScheduleTask {
    const state: ScheduleTaskState = {
      id: ScheduleTaskId.of(data.id),
      identityId: data.identity_id as IdentityId,
      name: data.name,
      description: data.description,
      sourceModule: data.source_module as SourceModule,
      sourceEntityId: data.source_entity_id,
      status: data.status as ScheduleTaskStatus,
      enabled: data.enabled === true || data.enabled === 1,
      schedule: ScheduleConfig.fromDTO({
        cronExpression: data.cron_expression ?? '',
        timezone: Timezone.of(data.timezone),
        startDate: data.start_date,
        endDate: data.end_date,
        maxExecutions: data.max_executions ?? null,
      }),
      execution: ExecutionInfo.fromDTO({
        nextRunAt: data.next_run_at,
        lastRunAt: data.last_run_at,
        executionCount: Number(data.execution_count ?? 0),
        lastExecutionStatus: (data.last_execution_status as ExecutionStatus) ?? null,
        lastExecutionDuration: data.last_execution_duration ?? null,
        consecutiveFailures: Number(data.consecutive_failures ?? 0),
      }),
      retryPolicy: RetryPolicy.fromDTO({
        enabled: data.enabled === true || data.enabled === 1,
        maxRetries: data.max_retries,
        retryDelay: data.initial_delay_ms ?? 0,
        backoffMultiplier: data.backoff_multiplier ?? 1,
        maxRetryDelay: data.max_delay_ms ?? 0,
      }),
      metadata: ScheduleTaskMetadata.fromDTO({
        payload: data.payload ? JSON.parse(data.payload) : {},
        tags: data.tags ? JSON.parse(data.tags) : [],
        priority: data.priority ? TaskPriority.of(data.priority) : TaskPriority.Normal,
        timeout: data.timeout,
      }),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      version: data.version ?? 1,
      deletedAt: data.deleted_at ? new Date(data.deleted_at) : null,
    };

    const task = ScheduleTask.load(state);
    for (const execution of executions) {
      task.addExecution(PowerSyncScheduleExecutionMapper.toDomain(execution));
    }
    return task;
  }

  static toPersistence(task: ScheduleTask) {
    const metadataDTO = task.metadata.toDTO();
    const scheduling = schedulingPersistenceMetadata(task);
    return {
      id: String(task.id),
      identityId: task.identityId,
      name: task.name,
      description: task.description,
      sourceModule: task.sourceModule,
      sourceEntityId: task.sourceEntityId,
      schedulingKey: scheduling.schedulingKey,
      ownerType: scheduling.ownerType,
      ownerId: scheduling.ownerId,
      handlerKey: scheduling.handlerKey,
      payloadVersion: scheduling.payloadVersion,
      sourceRevision: scheduling.sourceRevision,
      status: task.status,
      enabled: task.enabled ? 1 : 0,
      cronExpression: task.schedule.cronExpression,
      timezone: task.schedule.timezone,
      startDate:
        task.schedule.startDate !== null ? new Date(task.schedule.startDate).toISOString() : null,
      endDate:
        task.schedule.endDate !== null ? new Date(task.schedule.endDate).toISOString() : null,
      maxExecutions: task.schedule.maxExecutions,
      nextRunAt:
        task.execution.nextRunAt !== null ? new Date(task.execution.nextRunAt).toISOString() : null,
      lastRunAt:
        task.execution.lastRunAt !== null ? new Date(task.execution.lastRunAt).toISOString() : null,
      executionCount: task.execution.executionCount,
      lastExecutionStatus: task.execution.lastExecutionStatus
        ? String(task.execution.lastExecutionStatus)
        : null,
      lastExecutionDuration: task.execution.lastExecutionDuration,
      consecutiveFailures: task.execution.consecutiveFailures,
      maxRetries: task.retryPolicy.maxRetries ?? 3,
      initialDelayMs: task.retryPolicy.retryDelay ?? 1000,
      maxDelayMs: task.retryPolicy.maxRetryDelay ?? 30000,
      backoffMultiplier: task.retryPolicy.backoffMultiplier ?? 2,
      retryableStatuses: '[]',
      payload:
        typeof metadataDTO.payload === 'string'
          ? metadataDTO.payload
          : JSON.stringify(metadataDTO.payload),
      tags: JSON.stringify(metadataDTO.tags),
      priority: metadataDTO.priority,
      timeout: metadataDTO.timeout,
      version: task.version,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      deletedAt: task.deletedAt ? task.deletedAt.toISOString() : null,
    };
  }
}
