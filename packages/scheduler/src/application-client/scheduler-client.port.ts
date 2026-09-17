import type { Result } from '@memoflow/contracts/result';
import type {
  ScheduledInvocationDiagnostic,
  ScheduledInvocationDiagnosticQuery,
} from '@memoflow/contracts/schedule';

/** Read-only client capability for Temporal Engine diagnostics. */
export interface SchedulerClientPort {
  listInvocations(
    query?: ScheduledInvocationDiagnosticQuery,
  ): Promise<Result<ScheduledInvocationDiagnostic[]>>;
  getInvocation(id: string): Promise<Result<ScheduledInvocationDiagnostic | null>>;
  listDueInvocations(): Promise<Result<ScheduledInvocationDiagnostic[]>>;
}
