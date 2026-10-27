/**
 * Repository IPC Adapters - Registration
 */

import type { IResultIpcClient } from '../types';
import { RepositoryIpcAdapter } from './repository-ipc.adapter';

export { RepositoryIpcAdapter } from './repository-ipc.adapter';

export interface RepositoryIpcAdapters {
  repository: RepositoryIpcAdapter;
}

export function createRepositoryIpcAdapters(ipcClient: IResultIpcClient): RepositoryIpcAdapters {
  return { repository: new RepositoryIpcAdapter(ipcClient) };
}
