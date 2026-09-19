import type { IResultHttpClient } from '@memoflow/http-client';
import { SchedulerDiagnosticsHttpAdapter } from './scheduler-diagnostics-http.adapter';
export { SchedulerDiagnosticsHttpAdapter } from './scheduler-diagnostics-http.adapter';
export function createSchedulerHttpAdapter(
  httpClient: IResultHttpClient,
): SchedulerDiagnosticsHttpAdapter {
  return new SchedulerDiagnosticsHttpAdapter(httpClient);
}
