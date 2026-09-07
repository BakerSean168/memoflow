import type { ScheduleTask } from '../../domain/aggregates/schedule-task';

export type ScheduleTaskExecutionDisposition =
  | 'succeeded'
  | 'skipped'
  | 'failed'
  | 'dead_letter';

export interface ScheduleTaskExecutionResult {
  readonly nextRunAt?: number | null;
  readonly result?: Record<string, unknown>;
  /**
   * Optional neutral-handler outcome. Legacy source executors omit this and
   * retain the existing success/throw contract. `dead_letter` and `failed`
   * are terminal and must not enter retry; retryable handlers continue to throw.
   */
  readonly disposition?: ScheduleTaskExecutionDisposition;
  readonly error?: string;
}

export interface ScheduleTaskSourceExecutor {
  execute(task: ScheduleTask): Promise<ScheduleTaskExecutionResult | void>;
}
