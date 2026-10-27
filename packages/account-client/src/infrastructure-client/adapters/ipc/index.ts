/**
 * Account IPC Adapters - Registration
 */

import type { IResultIpcClient } from '../types';
import { AccountIpcAdapter } from './account-ipc.adapter';

export { AccountIpcAdapter, createAccountIpcAdapter } from './account-ipc.adapter';

export interface AccountIpcAdapters {
  account: AccountIpcAdapter;
}

export function createAccountIpcAdapters(ipcClient: IResultIpcClient): AccountIpcAdapters {
  return {
    account: new AccountIpcAdapter(ipcClient),
  };
}
