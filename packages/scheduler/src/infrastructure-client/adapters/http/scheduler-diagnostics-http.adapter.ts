import type { Result } from '@memoflow/contracts/result';
import type {
  ScheduledInvocationDiagnostic,
  ScheduledInvocationDiagnosticQuery,
} from '@memoflow/contracts/schedule';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { SchedulerDiagnosticsApiClient } from '../types';

export class SchedulerDiagnosticsHttpAdapter implements SchedulerDiagnosticsApiClient {
  private readonly baseUrl = '/scheduler/invocations';

  constructor(private readonly httpClient: IResultHttpClient) {}

  listInvocations(
    query?: ScheduledInvocationDiagnosticQuery,
  ): Promise<Result<ScheduledInvocationDiagnostic[]>> {
    return this.httpClient.get(this.baseUrl, { params: query ? { ...query } : undefined });
  }

  getInvocation(id: string): Promise<Result<ScheduledInvocationDiagnostic | null>> {
    return this.httpClient.get(`${this.baseUrl}/${encodeURIComponent(id)}`);
  }

  listDueInvocations(): Promise<Result<ScheduledInvocationDiagnostic[]>> {
    return this.httpClient.get(`${this.baseUrl}/due`);
  }
}

export function createSchedulerHttpAdapter(
  httpClient: IResultHttpClient,
): SchedulerDiagnosticsHttpAdapter {
  return new SchedulerDiagnosticsHttpAdapter(httpClient);
}
