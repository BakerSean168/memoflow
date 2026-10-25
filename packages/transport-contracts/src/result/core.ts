/**
 * Result Pattern core types and utilities.
 *
 * @module @memoflow/contracts/result/core
 */

export { ResultCode, type ResultCode as ResultCodeType } from './codes';
import { ResultCode } from './codes';
import { isPublicFailure, type PublicFailure } from './public-failure';

export interface ResultErrorDetail {
  field?: string;
  code: string;
  message: string;
  value?: unknown;
}

export interface ResultMeta {
  traceId?: string;
  duration?: number;
  timestamp?: number;
  source?: string;
}

export interface SuccessResult<T> {
  readonly ok: true;
  readonly data: T;
  readonly meta?: ResultMeta;
}

export interface FailureResult<E = ResultError> {
  readonly ok: false;
  readonly error: E;
  readonly meta?: ResultMeta;
}

export interface ResultError {
  code: ResultCode | string;
  message: string;
  details?: ResultErrorDetail[];
  context?: Record<string, unknown>;
  /** Typed, JSON-safe failure semantics carried during the legacy envelope migration. */
  failure?: PublicFailure;
  /** Internal-only diagnostic cause. Transport serializers must never emit it. */
  cause?: unknown;
}

export interface StructuredResultError extends ResultError {
  statusCode?: number;
}

export class ResultErrorException extends Error {
  readonly code: ResultCode | string;
  readonly details?: ResultErrorDetail[];
  readonly context?: Record<string, unknown>;
  readonly statusCode?: number;
  readonly failure?: PublicFailure;
  readonly cause?: unknown;

  constructor(
    message: string,
    code: ResultCode | string,
    details?: ResultErrorDetail[],
    context?: Record<string, unknown>,
    statusCode?: number,
    cause?: unknown,
    failure?: PublicFailure,
  ) {
    super(message);
    this.name = 'ResultErrorException';
    this.code = code;
    this.details = details;
    this.context = context;
    this.statusCode = statusCode;
    this.cause = cause;
    this.failure = failure;
  }
}

/**
 * Residual 1162 keep-boundary: contracts Result error shaping — non-null object (arrays allowed).
 * Soft residual 1162: app-vue AI plain-object isRecord (!Array) and desktop envelope isRecord remain separate soles (no force-merge).
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function extractStructuredResultError(error: unknown): StructuredResultError | null {
  if (error instanceof ResultErrorException) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      context: error.context,
      failure: error.failure,
      cause: error.cause,
      statusCode: error.statusCode,
    };
  }

  if (!isRecord(error)) {
    return null;
  }

  const code = typeof error.code === 'string' ? error.code : undefined;
  const message = typeof error.message === 'string' ? error.message : undefined;
  if (!code || !message) {
    return null;
  }

  const details = Array.isArray(error.details) ? (error.details as ResultErrorDetail[]) : undefined;
  const context = isRecord(error.context) ? error.context : undefined;
  const statusCode =
    typeof error.statusCode === 'number'
      ? error.statusCode
      : typeof error.httpStatus === 'number'
        ? error.httpStatus
        : undefined;
  const failure = isPublicFailure(error.failure) ? error.failure : undefined;
  const cause = 'cause' in error ? error.cause : undefined;

  if (!(error instanceof Error)) {
    return { code, message, details, context, failure, cause, statusCode };
  }

  if (
    statusCode !== undefined ||
    details !== undefined ||
    context !== undefined ||
    failure !== undefined
  ) {
    return { code, message, details, context, failure, cause, statusCode };
  }

  return null;
}

export type Result<T, E = ResultError> = SuccessResult<T> | FailureResult<E>;

export function ok<T>(data: T, meta?: ResultMeta): SuccessResult<T> {
  return { ok: true, data, meta };
}

export function fail<E = ResultError>(error: E, meta?: ResultMeta): FailureResult<E> {
  return { ok: false, error, meta };
}

export function error(
  code: ResultCode | string,
  message: string,
  details?: ResultErrorDetail[],
  meta?: ResultMeta,
): FailureResult<ResultError> {
  return fail({ code, message, details }, meta);
}

export function isOk<T, E>(result: Result<T, E>): result is SuccessResult<T> {
  return result.ok === true;
}

export function isFail<T, E>(result: Result<T, E>): result is FailureResult<E> {
  return result.ok === false;
}

/** Exhaustiveness helper for discriminated-union switches. */
export function assertNever(value: never, message = 'Unexpected union member'): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

export function unwrap<T>(result: Result<T>): T {
  if (isOk(result)) {
    return result.data;
  }
  throw toResultErrorException(result.error);
}

export function toResultErrorException(
  error: ResultError,
  statusCode?: number,
): ResultErrorException {
  return new ResultErrorException(
    error.message,
    error.code,
    error.details,
    error.context,
    statusCode,
    error.cause,
    error.failure,
  );
}

export function unwrapOrThrowError<T>(result: Result<T>, statusCode?: number): T {
  if (isOk(result)) {
    return result.data;
  }

  throw toResultErrorException(result.error, statusCode);
}

export function unwrapOr<T>(result: Result<T>, defaultValue: T): T {
  return isOk(result) ? result.data : defaultValue;
}

export function map<T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> {
  if (isOk(result)) {
    return ok(fn(result.data), result.meta);
  }
  return result;
}

export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (isFail(result)) {
    return fail(fn(result.error), result.meta);
  }
  return result;
}

export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => Result<U, E>,
): Result<U, E> {
  if (isOk(result)) {
    return fn(result.data);
  }
  return result;
}

export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorHandler?: (err: unknown) => ResultError,
): Promise<Result<T>> {
  try {
    const data = await fn();
    return ok(data);
  } catch (err) {
    if (errorHandler) {
      return fail(errorHandler(err));
    }
    return fail({
      code: ResultCode.UNKNOWN,
      message: err instanceof Error ? err.message : 'Unknown error',
      cause: err,
    });
  }
}

export function tryCatchSync<T>(
  fn: () => T,
  errorHandler?: (err: unknown) => ResultError,
): Result<T> {
  try {
    const data = fn();
    return ok(data);
  } catch (err) {
    if (errorHandler) {
      return fail(errorHandler(err));
    }
    return fail({
      code: ResultCode.UNKNOWN,
      message: err instanceof Error ? err.message : 'Unknown error',
      cause: err,
    });
  }
}

export type AsyncResult<T, E = ResultError> = Promise<Result<T, E>>;

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PagedList<T> {
  items: T[];
  pageInfo: PageInfo;
}

export function okPaged<T>(
  items: T[],
  pageInfo: PageInfo,
  meta?: ResultMeta,
): SuccessResult<PagedList<T>> {
  return ok({ items, pageInfo }, meta);
}

export const ResultErrors = {
  badRequest: (message = '请求参数错误', details?: ResultErrorDetail[]) =>
    error(ResultCode.BAD_REQUEST, message, details),

  unauthorized: (message = '未授权访问') => error(ResultCode.UNAUTHORIZED, message),

  forbidden: (message = '禁止访问') => error(ResultCode.FORBIDDEN, message),

  notFound: (message = '资源不存在') => error(ResultCode.NOT_FOUND, message),

  conflict: (message = '资源冲突') => error(ResultCode.CONFLICT, message),

  validation: (details: ResultErrorDetail[], message = '参数验证失败') =>
    error(ResultCode.VALIDATION_ERROR, message, details),

  internal: (message = '服务器内部错误') => error(ResultCode.INTERNAL_ERROR, message),

  serviceUnavailable: (message = '服务暂不可用') => error(ResultCode.SERVICE_UNAVAILABLE, message),

  timeout: (message = '请求超时') => error(ResultCode.TIMEOUT, message),

  business: (code: string, message: string, details?: ResultErrorDetail[]) =>
    error(code, message, details),
} as const;

export interface BatchResult<T, E = ResultError> {
  successCount: number;
  failureCount: number;
  totalCount: number;
  successes: T[];
  failures: Array<{
    index: number;
    input: unknown;
    error: E;
  }>;
}

export function okBatch<T, E = ResultError>(
  batch: BatchResult<T, E>,
  meta?: ResultMeta,
): SuccessResult<BatchResult<T, E>> {
  return ok(batch, meta);
}
