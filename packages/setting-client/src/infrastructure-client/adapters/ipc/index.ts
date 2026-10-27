/**
 * Setting IPC Adapters - Registration
 */

import type { IResultIpcClient } from '../types';
import { SettingIpcAdapter } from './setting-ipc.adapter';

export { SettingIpcAdapter } from './setting-ipc.adapter';

export interface SettingIpcAdapters {
  setting: SettingIpcAdapter;
}

export function createSettingIpcAdapters(ipcClient: IResultIpcClient): SettingIpcAdapters {
  return { setting: new SettingIpcAdapter(ipcClient) };
}
