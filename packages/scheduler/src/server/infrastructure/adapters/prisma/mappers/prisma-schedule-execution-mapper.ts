/**
 * Prisma Schedule Execution Mapper
 *
 * Maps between Prisma model and ScheduleExecution entity.
 */

import type { ScheduleExecution as PrismaScheduleExecution } from '@memoflow/database';
import { ScheduleExecution } from '../../../../domain/entities/schedule-execution';
import type { ExecutionStatus } from '@memoflow/contracts/schedule';

/**
 * PrismaScheduleExecutionMapper
 *
 * Handles conversion between ScheduleExecution entity and Prisma model.
 */
export class PrismaScheduleExecutionMapper {
  /** Converts a Prisma model to a ScheduleExecution domain entity. */
  public static toDomain(data: PrismaScheduleExecution): ScheduleExecution {
    return ScheduleExecution.load({
      id: data.id,
      taskId: data.taskId,
      identityId: data.identityId,
      executionTime: data.executionTime,
      status: data.status as ExecutionStatus,
      duration: data.duration ?? null,
      result: data.result
        ? typeof data.result === 'string'
          ? JSON.parse(data.result as string)
          : (data.result as Record<string, unknown>)
        : null,
      error: data.error ?? null,
      retryCount: data.retryCount,
      createdAt: data.createdAt,
    });
  }

  /** Converts a ScheduleExecution entity to Prisma persistence data. */
  public static toPersistence(
    execution: ScheduleExecution,
  ): Omit<PrismaScheduleExecution, 'createdAt'> {
    return {
      id: execution.id,
      taskId: execution.taskId,
      identityId: execution.identityId ?? '',
      executionTime: new Date(execution.executionTime),
      status: execution.status,
      duration: execution.duration ?? null,
      result: execution.result ? JSON.stringify(execution.result) : null,
      error: execution.error ?? null,
      retryCount: execution.retryCount ?? 0,
    };
  }

  /** Converts to Prisma create input data (includes createdAt). */
  public static toCreateInput(execution: ScheduleExecution): Record<string, unknown> {
    const persistence = this.toPersistence(execution);

    return {
      ...persistence,
      createdAt: execution.createdAt,
    };
  }

  /** Converts to Prisma update input data. */
  public static toUpdateInput(execution: ScheduleExecution): Record<string, unknown> {
    return this.toPersistence(execution);
  }
}
