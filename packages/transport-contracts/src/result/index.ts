/**
 * Result Pattern - unified result types and protocol adapters.
 *
 * @module @memoflow/contracts/result
 */

export * from './core';
export * from './public-failure';
export * from './failure-policy';
export * from './failure-compat';

export { toIpcResult, fromIpcResult, isIpcResultEnvelope, type IpcResult } from './ipc';

export {
  toHttpResponse,
  fromHttpResponse,
  getHttpStatusCode,
  errorCodeToHttpStatus,
  HttpResponseBuilder,
  createHttpResponseBuilder,
  isClientError,
  isServerError,
  publicFailureToHttpStatus,
  defineFailureHttpPolicy,
  FailureCategoryToHttpStatus,
  ResultCodeToHttpStatus,
  type FailureHttpRule,
  type FailureHttpPolicy,
  type HttpResponse,
  type HttpResponseOptions,
} from './http';

// Residual 615: retired success-boolean action dual-track helpers (Result envelope only).
