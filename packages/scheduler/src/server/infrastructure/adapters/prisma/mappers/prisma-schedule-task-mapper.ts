/**
 * Prisma ScheduleTask Mapper
 *
 * Maps between ScheduleTask domain aggregate and Prisma model.
 * Handles aggregate root + child entity (ScheduleExecution) conversion.
 */

import type {
  ScheduleTask as PrismaScheduleTask,
  ScheduleExecution as PrismaScheduleExecution,
} from '@memoflow/database';
import type { SourceModule, ScheduleTaskStatus } from '@memoflow/contracts/schedule';
import { ExecutionStatus } from '@memoflow/contracts/schedule';
import { ScheduleTask } from '../../../../domain/aggregates/schedule-task';
import type { ScheduleTaskState } from '../../../../domain/aggregates/schedule-task';
import { ScheduleExecution } from '../../../../domain/entities/schedule-execution';
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

/**
 * Prisma ScheduleTask with optional executions relation
 */
export type PrismaScheduleTaskWithExecutions = PrismaScheduleTask & {
  executions?: PrismaScheduleExecution[];
};

export class PrismaScheduleTaskMapper {
  /** Converts a Prisma record to a ScheduleTask aggregate root (with optional executions). */
  static toDomain(data: PrismaScheduleTaskWithExecutions): ScheduleTask {
    const state: ScheduleTaskState = {
      id: ScheduleTaskId.of(data.id),
      identityId: data.identityId as IdentityId,
      name: data.name,
      description: data.description,
      sourceModule: data.sourceModule as SourceModule,
      sourceEntityId: data.sourceEntityId,
      status: data.status as ScheduleTaskStatus,
      enabled: data.enabled,
      schedule: ScheduleConfig.fromDTO({
        cronExpression: data.cronExpression ?? '',
        timezone: Timezone.of(data.timezone),
        startDate: data.startDate ? data.startDate.toISOString() : null,
        endDate: data.endDate ? data.endDate.toISOString() : null,
        maxExecutions: data.maxExecutions ?? null,
      }),
      execution: ExecutionInfo.fromDTO({
        nextRunAt: data.nextRunAt ? data.nextRunAt.toISOString() : null,
        lastRunAt: data.lastRunAt ? data.lastRunAt.toISOString() : null,
        executionCount: data.executionCount,
        lastExecutionStatus: (data.lastExecutionStatus as ExecutionStatus) ?? null,
        lastExecutionDuration: data.lastExecutionDuration ?? null,
        consecutiveFailures: data.consecutiveFailures ?? 0,
      }),
      retryPolicy: RetryPolicy.fromDTO({
        enabled: data.enabled,
        maxRetries: data.maxRetries,
        retryDelay: data.initialDelayMs ?? 0,
        backoffMultiplier: data.backoffMultiplier ?? 1,
        maxRetryDelay: data.maxDelayMs ?? 0,
      }),
      metadata: ScheduleTaskMetadata.fromDTO({
        payload:
          typeof data.payload === 'string'
            ? JSON.parse(data.payload)
            : (data.payload ?? {}),
        tags: data.tags
          ? typeof data.tags === 'string'
            ? JSON.parse(data.tags)
            : data.tags
          : [],
        priority: data.priority ? TaskPriority.of(data.priority) : TaskPriority.Normal,
        timeout: data.timeout,
      }),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      version: data.version ?? 1,
      deletedAt: data.deletedAt ?? null,
    };

    const task = ScheduleTask.load(state);

    // Load child entities - executions
    if (data.executions && data.executions.length > 0) {
      for (const execData of data.executions) {
        const execution = ScheduleExecution.load({
          id: execData.id,
          taskId: execData.taskId,
          executionTime: execData.executionTime,
          status: execData.status as ExecutionStatus,
          duration: execData.duration ?? null,
          result: execData.result
            ? typeof execData.result === 'string'
              ? JSON.parse(execData.result as string)
              : (execData.result as Record<string, unknown>)
            : null,
          error: execData.error ?? null,
          retryCount: execData.retryCount,
          createdAt: execData.createdAt,
        });
        task.addExecution(execution);
      }
    }

    return task;
  }

  /** Converts a ScheduleTask aggregate to Prisma write data. */
  static toPersistence(task: ScheduleTask) {
    const metadataDTO = task.metadata.toDTO();
    const scheduling = schedulingPersistenceMetadata(task);

    return {
      id: task.id,
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
      enabled: task.enabled,
      cronExpression: task.schedule.cronExpression,
      timezone: task.schedule.timezone,
      startDate: task.schedule.startDate !== null ? new Date(task.schedule.startDate) : null,
      endDate: task.schedule.endDate !== null ? new Date(task.schedule.endDate) : null,
      maxExecutions: task.schedule.maxExecutions,
      nextRunAt: task.execution.nextRunAt !== null ? new Date(task.execution.nextRunAt) : null,
      lastRunAt: task.execution.lastRunAt !== null ? new Date(task.execution.lastRunAt) : null,
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
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}
