import type { Result } from '@memoflow/contracts/result';
import type { Context } from '@memoflow/contracts/shared';

/** Read-only Temporal Engine diagnostics surface. */
export interface SchedulerApplicationPort {
  listTasks(query: Record<string, unknown>, ctx: Context): Promise<Result<unknown>>;
  getTask(id: string, ctx: Context): Promise<Result<unknown>>;
  getDueTasks(ctx: Context): Promise<Result<unknown>>;
}
