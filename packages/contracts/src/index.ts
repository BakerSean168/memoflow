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
 * import { GoalServerDTO, GoalStatus } from '@memoflow/goal-contracts';
 * import { TaskPlanServer } from '@memoflow/task-contracts';
 * import { HttpResponse, ResultCode } from '@memoflow/contracts/result';
 *
 * // ✅ 命名空间导入（避免命名冲突）
 * import * as GoalContracts from '@memoflow/goal-contracts';
 * import * as TaskContracts from '@memoflow/task-contracts';
 * ```
 *
 * 子路径列表：
 * - @memoflow/task-contracts       - 任务模块
 * - @memoflow/goal-contracts       - 目标模块（P2 已独立成包）
 * - @memoflow/repository-contracts - 仓库模块
 * - @memoflow/contracts/account    - 账户模块
 * - @memoflow/schedule-contracts   - 调度模块
 * - @memoflow/setting-contracts    - 设置模块（已独立成包）
 * - @memoflow/ai-contracts         - AI模块
 * - @memoflow/contracts/result     - Result Pattern (新，推荐)
 * - @memoflow/contracts/shared     - 共享类型
 */

// ============================================================
// Primitives
// ============================================================
export { brandedId } from '@memoflow/shared-primitives';
export type { IdentityId, TimeZoneId } from '@memoflow/shared-primitives';

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
} from '@memoflow/transport-contracts';

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
} from '@memoflow/transport-contracts';

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

export {
  DesktopCloudConnectionRequestSchema,
  DesktopCloudAttemptRequestSchema,
  CloudAuthResponseSchema,
  BetterAuthSessionResponseSchema,
} from './cloud-auth';
export type { DesktopCloudConnectionRequest, DesktopCloudConnectionResult } from './cloud-auth';
