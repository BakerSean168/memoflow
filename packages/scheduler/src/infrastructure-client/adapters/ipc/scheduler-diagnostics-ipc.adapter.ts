import { SchedulerChannels } from '@memoflow/contracts/electron';
import type { Result } from '@memoflow/contracts/result';
import type {
  ScheduledInvocationDiagnostic,
  ScheduledInvocationDiagnosticQuery,
} from '@memoflow/contracts/schedule';
import type { IResultIpcClient, SchedulerDiagnosticsApiClient } from '../types';

export class SchedulerDiagnosticsIpcAdapter implements SchedulerDiagnosticsApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  listInvocations(
    query?: ScheduledInvocationDiagnosticQuery,
  ): Promise<Result<ScheduledInvocationDiagnostic[]>> {
    return this.ipcClient.invoke(SchedulerChannels.INVOCATION_LIST, query ?? {});
  }

  getInvocation(id: string): Promise<Result<ScheduledInvocationDiagnostic | null>> {
    return this.ipcClient.invoke(SchedulerChannels.INVOCATION_GET_BY_ID, id);
  }

  listDueInvocations(): Promise<Result<ScheduledInvocationDiagnostic[]>> {
    return this.ipcClient.invoke(SchedulerChannels.INVOCATION_GET_DUE);
  }
}

export function createSchedulerIpcAdapter(
  ipcClient: IResultIpcClient,
): SchedulerDiagnosticsIpcAdapter {
  return new SchedulerDiagnosticsIpcAdapter(ipcClient);
}
