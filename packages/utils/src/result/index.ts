/**
 * Result Utilities
 *
 * 为各框架提供 Result 的集成工具
 * - Express Adapter: 将 Controller 函数适配为 Express 路由处理器
 * - IPC Adapter: 将 Controller 函数适配为 Electron IPC 处理器
 *
 * @module @memoflow/utils/result
 */

// ============================================================================
// Re-exports from contracts
// ============================================================================

export {
  // Core Result
  ok,
  fail,
  error,
  isOk,
  isFail,
  unwrap,
  unwrapOrThrowError,
  unwrapOr,
  toResultErrorException,
  map,
  mapError,
  flatMap,
  tryCatch,
  tryCatchSync,
  extractStructuredResultError,
  ResultCode,
  ResultErrors,
  ResultErrorException,
  okPaged,
  okBatch,
  // HTTP
  toHttpResponse,
  fromHttpResponse,
  getHttpStatusCode,
  errorCodeToHttpStatus,
  HttpResponseBuilder,
  createHttpResponseBuilder,
  ResultCodeToHttpStatus,
  isClientError,
  isServerError,
  // IPC
  toIpcResult,
  fromIpcResult,
} from '@memoflow/transport-contracts/result';

export type {
  Result,
  SuccessResult,
  FailureResult,
  ResultError,
  ResultErrorDetail,
  ResultMeta,
  StructuredResultError,
  AsyncResult,
  PageInfo,
  PagedList,
  BatchResult,
  IpcResult,
  HttpResponse,
  HttpResponseOptions,
} from '@memoflow/transport-contracts/result';

// ============================================================================
// Express Adapter
// ============================================================================

export {
  expressAdapter,
  expressAdapterWithValidation,
  defaultExtractContext,
  readExpressRequestContext,
  type ExpressAdapterOptions,
  type ExpressAdapterValidationOptions,
} from './express-adapter';

// Residual 945: formatZodErrors sole body (not adapter-local dual).
export { formatZodErrors } from './format-zod-errors';

// ============================================================================
// IPC Adapter
// ============================================================================

export {
  ipcAdapter,
  ipcAdapterWithValidation,
  type IpcAdapterOptions,
  type IpcAdapterValidationOptions,
} from './ipc-adapter';

export { resultify } from './resultify';

// ============================================================================
// Route Registrar (unified Express + OpenAPI registration)
// ============================================================================

export {
  RouteRegistrar,
  type OpenApiRegistryLike,
  type HttpMethod,
  type ApiRouteDefinition,
  type ApiRouteValidationBinding,
  type RouteRegistrarConfig,
} from './route-registrar';

// ============================================================================
// OpenAPI Response Helpers
// ============================================================================

export { successResponse, errorResponse, OpenApiErrorResponseSchema } from './openapi-helpers';
