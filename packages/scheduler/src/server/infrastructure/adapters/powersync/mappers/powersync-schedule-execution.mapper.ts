import { ScheduleExecution } from '../../../../domain/entities/schedule-execution';
import type { ScheduleExecutionState } from '../../../../domain/entities/schedule-execution';
import type { ExecutionStatus } from '@memoflow/contracts/schedule';

export type PowerSyncScheduleExecutionRow = {
  id: string;
  task_id: string;
  identity_id: string | null;
  execution_time: string;
  status: string;
  duration: number | null;
  result: string | null;
  error: string | null;
  retry_count: number;
  created_at: string;
};

export class PowerSyncScheduleExecutionMapper {
  static toDomain(data: PowerSyncScheduleExecutionRow): ScheduleExecution {
    const state: ScheduleExecutionState = {
      id: data.id,
      taskId: data.task_id,
      identityId: data.identity_id ?? undefined,
      executionTime: new Date(data.execution_time),
      status: data.status as ExecutionStatus,
      duration: data.duration ?? null,
      result: data.result ? (JSON.parse(data.result) as Record<string, unknown>) : null,
      error: data.error ?? null,
      retryCount: Number(data.retry_count ?? 0),
      createdAt: new Date(data.created_at),
    };
    return ScheduleExecution.load(state);
  }

  static toPersistence(execution: ScheduleExecution) {
    return {
      id: execution.id,
      taskId: execution.taskId,
      identityId: execution.identityId ?? null,
      executionTime: new Date(execution.executionTime).toISOString(),
      status: execution.status,
      duration: execution.duration ?? null,
      result: execution.result ? JSON.stringify(execution.result) : null,
      error: execution.error ?? null,
      retryCount: execution.retryCount ?? 0,
      createdAt: execution.createdAt.toISOString(),
    };
  }
}
