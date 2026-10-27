import type { Result } from '@memoflow/transport-contracts/result';
import type {
  ScheduledInvocationDiagnostic,
  ScheduledInvocationDiagnosticQuery,
} from '@memoflow/schedule-contracts';

/** Read-only client seam for canonical Scheduler diagnostics. */
export interface SchedulerDiagnosticsApiClient {
  listInvocations(
    query?: ScheduledInvocationDiagnosticQuery,
  ): Promise<Result<ScheduledInvocationDiagnostic[]>>;
  getInvocation(id: string): Promise<Result<ScheduledInvocationDiagnostic | null>>;
  listDueInvocations(): Promise<Result<ScheduledInvocationDiagnostic[]>>;
}
