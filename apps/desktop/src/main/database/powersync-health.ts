/** Safe PowerSync download diagnostics: no credentials, owners, URLs or error messages. */
export interface PowerSyncStatusLike {
  readonly connected?: boolean;
  readonly connecting?: boolean;
  readonly hasSynced?: boolean;
  readonly dataFlowStatus?: {
    readonly downloadError?: unknown;
  };
}

export interface SafeSyncHealth {
  readonly phase: 'idle' | 'connecting' | 'download_error' | 'connected' | 'synced';
  readonly hasSynced: boolean;
  readonly errorType?: string;
  readonly errorCode?: string;
  readonly httpStatus?: number;
}

const SAFE_ERROR_TYPES = new Set([
  'Error',
  'TypeError',
  'AbortError',
  'TimeoutError',
  'NetworkError',
  'FetchError',
  'AuthorizationError',
  'PowerSyncError',
]);

export function safeSyncErrorType(error: unknown): string {
  if (!error || typeof error !== 'object') return 'UnknownError';
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' && SAFE_ERROR_TYPES.has(name) ? name : 'UnknownError';
}

/** Never serialize an SDK Error: message, stack and arbitrary fields can hold bearer tokens. */
export function describePowerSyncStatus(
  status: PowerSyncStatusLike | null | undefined,
): SafeSyncHealth {
  const hasSynced = status?.hasSynced === true;
  const error = status?.dataFlowStatus?.downloadError;
  if (error != null) {
    const record = typeof error === 'object' ? (error as Record<string, unknown>) : null;
    const candidateCode = record?.code;
    const httpStatus = record?.status ?? record?.statusCode;
    return {
      phase: 'download_error',
      hasSynced,
      errorType: safeSyncErrorType(error),
      ...(typeof candidateCode === 'string' && /^PSYNC_[A-Z0-9_]{1,32}$/.test(candidateCode)
        ? { errorCode: candidateCode }
        : {}),
      ...(typeof httpStatus === 'number' &&
      Number.isInteger(httpStatus) &&
      httpStatus >= 400 &&
      httpStatus <= 599
        ? { httpStatus }
        : {}),
    };
  }
  return {
    phase: status?.connected
      ? hasSynced
        ? 'synced'
        : 'connected'
      : status?.connecting
        ? 'connecting'
        : 'idle',
    hasSynced,
  };
}
