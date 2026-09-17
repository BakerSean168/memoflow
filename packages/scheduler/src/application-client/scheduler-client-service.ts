import type { Result } from '@memoflow/contracts/result';
import type {
  ScheduledInvocationDiagnostic,
  ScheduledInvocationDiagnosticQuery,
} from '@memoflow/contracts/schedule';
import type { SchedulerDiagnosticsApiClient } from './ports/scheduler-diagnostics-api-client.port';
import type { SchedulerClientPort } from './scheduler-client.port';

export class SchedulerClientService implements SchedulerClientPort {
  constructor(private readonly diagnosticsApi: SchedulerDiagnosticsApiClient) {}

  listInvocations(
    query?: ScheduledInvocationDiagnosticQuery,
  ): Promise<Result<ScheduledInvocationDiagnostic[]>> {
    return this.diagnosticsApi.listInvocations(query);
  }

  getInvocation(id: string): Promise<Result<ScheduledInvocationDiagnostic | null>> {
    return this.diagnosticsApi.getInvocation(id);
  }

  listDueInvocations(): Promise<Result<ScheduledInvocationDiagnostic[]>> {
    return this.diagnosticsApi.listDueInvocations();
  }
}

export function createSchedulerClientService(
  diagnosticsApi: SchedulerDiagnosticsApiClient,
): SchedulerClientService {
  return new SchedulerClientService(diagnosticsApi);
}
