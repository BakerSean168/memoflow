import type { Context } from '@memoflow/transport-contracts';
import type { ScheduledInvocationDiagnosticQuery } from '@memoflow/schedule-contracts';
import type { SchedulerApplicationPort } from '../application';

/** Read-only canonical Scheduler diagnostics controller. */
export class SchedulerController {
  constructor(private readonly api: SchedulerApplicationPort) {}

  listInvocations(query: ScheduledInvocationDiagnosticQuery, ctx: Context) {
    return this.api.listInvocations(query, ctx);
  }

  getInvocation(id: string, ctx: Context) {
    return this.api.getInvocation(id, ctx);
  }

  listDueInvocations(ctx: Context) {
    return this.api.listDueInvocations(ctx);
  }
}
