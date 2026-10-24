/**
 * @memoflow/ipc-client — Result-mode Electron IPC client
 *
 * Symmetric with `@memoflow/http-client` ResultHttpClient:
 * all invokes return `Promise<Result<T>>`, never throw, and require
 * contracts IpcResult envelopes (no raw dual-track passthrough).
 *
 * Desktop DI uses `createResultIpcClient` only; throw-style dual client removed.
 *
 * @module @memoflow/ipc-client
 *
 * @example
 * ```ts
 * import { createResultIpcClient } from '@memoflow/ipc-client';
 *
 * const ipc = createResultIpcClient({ bridge: window.electronAPI });
 * const result = await ipc.invoke<Goal[]>('goal:list');
 *
 * if (result.ok) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */

// ── Types ──
export type { ElectronBridge, IpcClientConfig, IResultIpcClient } from './types';
export { DEFAULT_IPC_CLIENT_CONFIG } from './types';

// ── Result IPC Client ──
export { ResultIpcClient } from './result-ipc-client';

// ── Factory ──
import type { IpcClientConfig } from './types';
import { ResultIpcClient } from './result-ipc-client';

/**
 * Create a ResultIpcClient (never throws; returns Result envelopes).
 */
export function createResultIpcClient(config: IpcClientConfig): ResultIpcClient {
  return new ResultIpcClient(config);
}
