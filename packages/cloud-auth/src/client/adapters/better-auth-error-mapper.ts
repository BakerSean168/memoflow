import type { ResultError } from '@memoflow/contracts/result';

interface FailureProjection {
  readonly code: string;
  readonly message: string;
}

const PROVIDER_FAILURE_PROJECTIONS: Readonly<Record<string, FailureProjection>> = Object.freeze({
  INVALID_EMAIL_OR_PASSWORD: Object.freeze({
    code: 'UNAUTHORIZED',
    message: 'Invalid credentials',
  }),
  EMAIL_NOT_VERIFIED: Object.freeze({
    code: 'EMAIL_VERIFICATION_REQUIRED',
    message: 'Email verification required',
  }),
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: Object.freeze({
    code: 'USER_ALREADY_EXISTS',
    message: 'Account already exists',
  }),
});

const APPLICATION_FAILURE_PROJECTIONS: Readonly<Record<string, FailureProjection>> = Object.freeze({
  USER_ALREADY_EXISTS: Object.freeze({
    code: 'USER_ALREADY_EXISTS',
    message: 'Account already exists',
  }),
  ACCOUNT_CLOSED: Object.freeze({
    code: 'ACCOUNT_CLOSED',
    message: 'Account is closed',
  }),
  INVALID_TOKEN: Object.freeze({
    code: 'INVALID_TOKEN',
    message: 'Authentication token is invalid',
  }),
  TOKEN_EXPIRED: Object.freeze({
    code: 'TOKEN_EXPIRED',
    message: 'Authentication token has expired',
  }),
  VALIDATION_ERROR: Object.freeze({
    code: 'VALIDATION_ERROR',
    message: 'Authentication request is invalid',
  }),
});

const STATUS_FAILURE_PROJECTIONS: Readonly<Record<number, FailureProjection>> = Object.freeze({
  400: Object.freeze({ code: 'BAD_REQUEST', message: 'Authentication request is invalid' }),
  401: Object.freeze({ code: 'UNAUTHORIZED', message: 'Invalid credentials' }),
  403: Object.freeze({ code: 'FORBIDDEN', message: 'Authentication request was rejected' }),
  404: Object.freeze({ code: 'NOT_FOUND', message: 'Authentication resource was not found' }),
  408: Object.freeze({ code: 'TIMEOUT', message: 'Authentication request timed out' }),
  409: Object.freeze({
    code: 'CONFLICT',
    message: 'Authentication request conflicts with current state',
  }),
  422: Object.freeze({ code: 'VALIDATION_ERROR', message: 'Authentication request is invalid' }),
  429: Object.freeze({ code: 'RATE_LIMITED', message: 'Too many authentication attempts' }),
  500: Object.freeze({ code: 'INTERNAL_ERROR', message: 'Authentication service failed' }),
  502: Object.freeze({
    code: 'SERVICE_UNAVAILABLE',
    message: 'Authentication service is unavailable',
  }),
  503: Object.freeze({
    code: 'SERVICE_UNAVAILABLE',
    message: 'Authentication service is unavailable',
  }),
  504: Object.freeze({ code: 'TIMEOUT', message: 'Authentication request timed out' }),
});

function readUppercaseCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const value = typeof record.code === 'string' ? record.code : record.error;
  return typeof value === 'string' ? value.toUpperCase() : null;
}

/**
 * Convert Better Auth response details into MemoFlow-owned, provider-neutral failures.
 * Raw provider codes and messages must not cross this adapter boundary.
 */
export function mapBetterAuthFailure(payload: unknown, status: number): ResultError {
  const rawCode = readUppercaseCode(payload);
  const projection = (rawCode ? PROVIDER_FAILURE_PROJECTIONS[rawCode] : undefined) ??
    (rawCode ? APPLICATION_FAILURE_PROJECTIONS[rawCode] : undefined) ??
    STATUS_FAILURE_PROJECTIONS[status] ?? {
      code: 'AUTH_REQUEST_FAILED',
      message: 'Authentication request failed',
    };

  return { code: projection.code, message: projection.message };
}
