/** Safe PowerSync download diagnostics: no credentials, owners, URLs or error messages. */
export interface PowerSyncStatusLike {
  readonly connected?: boolean;
  readonly connecting?: boolean;
  readonly hasSynced?: boolean;
  readonly lastSyncedAt?: unknown;
  readonly dataFlowStatus?: {
    readonly downloadError?: unknown;
  };
}

export interface SafeSyncHealth {
  readonly phase: 'idle' | 'connecting' | 'download_error' | 'connected' | 'synced';
  readonly hasSynced: boolean;
  /** Epoch milliseconds of the last completed sync, when the SDK reports it. */
  readonly lastSyncedAt?: number;
  readonly errorType?: string;
  readonly errorCode?: string;
  readonly httpStatus?: number;
}

export type SafeSyncErrorCategory =
  | 'network'
  | 'authorization'
  | 'validation'
  | 'server'
  | 'unknown';

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

const NETWORK_ERROR_TYPES = new Set([
  'TypeError',
  'AbortError',
  'TimeoutError',
  'NetworkError',
  'FetchError',
]);

const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{1,39}$/;

function safeLastSyncedAt(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }
  return null;
}

export function safeSyncErrorType(error: unknown): string {
  if (!error || typeof error !== 'object') return 'UnknownError';
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' && SAFE_ERROR_TYPES.has(name) ? name : 'UnknownError';
}

/**
 * Machine-readable transport code (ENOTFOUND, CERT_HAS_EXPIRED, ...) from the
 * error or its cause. Only an allowlisted shape is returned so free-form
 * messages, URLs or credentials can never pass as a code.
 */
export function safeSyncErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidates = [error, (error as { cause?: unknown }).cause];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const code = (candidate as { code?: unknown }).code;
    if (typeof code === 'string' && SAFE_ERROR_CODE.test(code)) return code;
  }
  return undefined;
}

/** Categorical failure only; never carries a message, URL, or credential. */
export function safeSyncErrorCategory(health: SafeSyncHealth): SafeSyncErrorCategory | null {
  if (health.phase !== 'download_error') return null;
  if (health.httpStatus === 401 || health.httpStatus === 403) return 'authorization';
  if (health.httpStatus !== undefined) {
    if (health.httpStatus >= 400 && health.httpStatus < 500) return 'validation';
    if (health.httpStatus >= 500) return 'server';
  }
  if (health.errorType && NETWORK_ERROR_TYPES.has(health.errorType)) return 'network';
  if (health.errorType === 'AuthorizationError') return 'authorization';
  return 'unknown';
}

/** Never serialize an SDK Error: message, stack and arbitrary fields can hold bearer tokens. */
export function describePowerSyncStatus(
  status: PowerSyncStatusLike | null | undefined,
): SafeSyncHealth {
  const hasSynced = status?.hasSynced === true;
  const lastSyncedAt = safeLastSyncedAt(status?.lastSyncedAt);
  const time = lastSyncedAt === null ? {} : { lastSyncedAt };
  const error = status?.dataFlowStatus?.downloadError;
  if (error != null) {
    const record = typeof error === 'object' ? (error as Record<string, unknown>) : null;
    const candidateCode = record?.code;
    const httpStatus = record?.status ?? record?.statusCode;
    return {
      phase: 'download_error',
      hasSynced,
      ...time,
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
    ...time,
  };
}
