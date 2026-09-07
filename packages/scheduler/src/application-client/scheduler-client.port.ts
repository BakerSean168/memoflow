import type { Result } from '@memoflow/contracts/result';
import type { SourceModule } from '@memoflow/contracts/schedule';
import type { ScheduleTask } from '../domain-client/aggregates/schedule-task';

/** Read-only client capability for Temporal Engine diagnostics. */
export interface SchedulerClientPort {
  getTasks(): Promise<Result<ScheduleTask[]>>;
  getTaskById(taskId: string): Promise<Result<ScheduleTask>>;
  getDueTasks(params?: { beforeTime?: string; limit?: number }): Promise<Result<ScheduleTask[]>>;
  getTaskBySource(
    sourceModule: SourceModule,
    sourceEntityId: string,
  ): Promise<Result<ScheduleTask[]>>;
}
