/**
 * @memoflow/contracts
 * 统一契约导出 - 根入口（极简版）
 *
 * ⚠️ 此根入口仅导出最核心的响应系统类型。
 * 所有业务模块请使用子路径导入以获得最佳 Tree-Shaking 效果。
 *
 * 🎨 子路径导出架构（推荐使用子路径导入）
 *
 * ```typescript
 * // ✅ 推荐：从子路径导入（极致 Tree-Shaking）
 * import { GoalServerDTO, GoalStatus } from '@memoflow/contracts/goal';
 * import { TaskPlanServer, TaskType } from '@memoflow/contracts/task';
 * import { HttpResponse, ResultCode } from '@memoflow/contracts/result';
 *
 * // ✅ 命名空间导入（避免命名冲突）
 * import * as GoalContracts from '@memoflow/contracts/goal';
 * import * as TaskContracts from '@memoflow/contracts/task';
 * ```
 *
 * 子路径列表：
 * - @memoflow/contracts/task       - 任务模块
 * - @memoflow/contracts/goal       - 目标模块
 * - @memoflow/contracts/governance - 治理模块
 * - @memoflow/contracts/reminder   - 提醒模块
 * - @memoflow/contracts/repository - 仓库模块
 * - @memoflow/contracts/account    - 账户模块
 * - @memoflow/contracts/schedule   - 调度模块
 * - @memoflow/contracts/setting    - 设置模块
 * - @memoflow/contracts/notification - 通知模块
 * - @memoflow/contracts/ai         - AI模块
 * - @memoflow/contracts/dashboard  - 仪表盘模块
 * - @memoflow/contracts/result     - Result Pattern (新，推荐)
 * - @memoflow/contracts/shared     - 共享类型
 */

// ============================================================
// Primitives
// ============================================================
export { brandedId } from './primitives';
export type { IdentityId, TimeZoneId } from './primitives';

// ============================================================
// Operations (W7 统一 operation timeline / replay / audit)
// ============================================================
export * from './modules/operations';
// ============================================================
// Result Pattern（Protocol Agnostic 统一结果类型，推荐）
// ============================================================
export {
  // Core types
  ResultCode,
  // Constructors
  ok,
  fail,
  error,
  // Type guards
  isOk,
  isFail,
  // Utilities
  assertNever,
  unwrap,
  unwrapOrThrowError,
  toResultErrorException,
  unwrapOr,
  map,
  mapError,
  flatMap,
  tryCatch,
  tryCatchSync,
  extractStructuredResultError,
  // Pagination
  okPaged,
  // Batch
  okBatch,
  // Error factories
  ResultErrors,
  ResultErrorException,
  // Public failure foundation
  FailureCategories,
  FailureCategorySchema,
  FailureRetryHintSchema,
  FailureReferenceSchema,
  EmptyFailureDetailsSchema,
  strictFailureDetails,
  defineFailureRegistry,
  createPublicFailure,
  createPublicFailureSchema,
  defineFailureProjection,
  isJsonValue,
  isPublicFailure,
  decideOperationRetry,
  operationBackoffDelay,
  toLegacyResultError,
  getPublicFailure,
  // IPC adapters
  toIpcResult,
  fromIpcResult,
  // HTTP adapters
  toHttpResponse,
  fromHttpResponse,
  getHttpStatusCode,
  errorCodeToHttpStatus,
  HttpResponseBuilder,
  createHttpResponseBuilder,
  ResultCodeToHttpStatus,
  FailureCategoryToHttpStatus,
  defineFailureHttpPolicy,
  publicFailureToHttpStatus,
  isClientError,
  isServerError,
} from './result';

export type {
  Result,
  SuccessResult,
  FailureResult,
  ResultError,
  ResultErrorDetail,
  ResultMeta,
  StructuredResultError,
  PublicFailure,
  FailureCategory,
  FailureRetryHint,
  FailureReference,
  FailureDefinition,
  FailureRegistry,
  FailureCodeOf,
  FailureDetailsOf,
  PublicFailureOf,
  StrictFailureDetailsSchema,
  JsonPrimitive,
  JsonObject,
  JsonValue,
  BackoffPolicy,
  OperationRetryMode,
  OperationRetryPolicy,
  RecoveryAction,
  RetryDecision,
  FailureHttpRule,
  FailureHttpPolicy,
  AsyncResult,
  PageInfo,
  PagedList,
  BatchResult,
  IpcResult,
  HttpResponse,
  HttpResponseOptions,
} from './result';

export type {
  CloudAccountSummary,
  CloudSessionSummary,
  CloudAuthResponse,
  CloudSessionState,
  CloudSignInRequest,
  CloudSignUpRequest,
  CloudSessionClientPort,
  CloudAuthClientPort,
  CloudAuthWebClientPort,
  CloudAuthDesktopClientPort,
  DeviceAuthorizationDecisionStatus,
  DeviceAuthorizationVerification,
  DesktopCloudConnectionStatus,
  DesktopCloudConnectionAttempt,
} from './cloud-auth';
