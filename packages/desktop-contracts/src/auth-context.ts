import type { ExecutionContext } from '@memoflow/transport-contracts';

export type ElectronAuthResolutionCode = 'AUTH_REQUIRED' | 'AUTH_RESTORING';

export class ElectronAuthResolutionError extends Error {
  constructor(readonly code: ElectronAuthResolutionCode) {
    super(code);
    this.name = 'ElectronAuthResolutionError';
  }
}

export function isElectronAuthResolutionError(
  error: unknown,
): error is ElectronAuthResolutionError {
  return error instanceof ElectronAuthResolutionError;
}

/**
 * Electron IPC auth context — resolves the local profile owner and produces the
 * canonical `ExecutionContext` (requestId/traceId/startedAt/source: 'ipc') once
 * per invocation.
 * Electron IPC 鉴权上下文 — 解析本地 profile owner 并每次 invocation 生成一次
 * canonical `ExecutionContext`（requestId/traceId/startedAt/source: 'ipc'）。
 */
export interface IElectronAuthContext {
  getIdentityId(): Promise<string | null>;
  requireIdentityId(): Promise<string>;
  getSessionId(): Promise<string | null>;
  getRequestContext(): Promise<ExecutionContext | null>;
  requireRequestContext(): Promise<ExecutionContext>;
  isAuthenticated(): Promise<boolean>;
}
