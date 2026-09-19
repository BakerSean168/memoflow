import type { Result } from '@memoflow/contracts/result';
import type { Context } from '@memoflow/contracts/shared';
import type {
  ScheduledInvocationDiagnostic,
  ScheduledInvocationDiagnosticQuery,
} from '@memoflow/contracts/schedule';

/** Read-only internal/dev/ops diagnostics surface for canonical Scheduler invocations. */
export interface SchedulerApplicationPort {
  listInvocations(
    query: ScheduledInvocationDiagnosticQuery,
    ctx: Context,
  ): Promise<Result<ScheduledInvocationDiagnostic[]>>;
  getInvocation(
    id: string,
    ctx: Context,
  ): Promise<Result<ScheduledInvocationDiagnostic | null>>;
  listDueInvocations(ctx: Context): Promise<Result<ScheduledInvocationDiagnostic[]>>;
}
