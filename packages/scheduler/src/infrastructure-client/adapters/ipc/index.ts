import type { IResultIpcClient } from '../types';
import { SchedulerDiagnosticsIpcAdapter } from './scheduler-diagnostics-ipc.adapter';
export { SchedulerDiagnosticsIpcAdapter } from './scheduler-diagnostics-ipc.adapter';
export function createSchedulerIpcAdapter(
  ipcClient: IResultIpcClient,
): SchedulerDiagnosticsIpcAdapter {
  return new SchedulerDiagnosticsIpcAdapter(ipcClient);
}
