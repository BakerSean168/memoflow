/**
 * HTTP Result Adapter
 *
 * 为 HTTP API 提供 Result 到 HTTP Response 的适配
 * 支持 Express、Fastify、Koa 等框架
 *
 * @module @memoflow/contracts/result/http
 */

// Import ResultCode from codes.ts to avoid circular dependency issues
import { ResultCode } from './codes';
import type { Result, ResultError, ResultMeta, ResultErrorDetail, PageInfo } from './core';
import { ok, fail, isOk } from './core';
import type {
  FailureCategory,
  FailureCodeOf,
  FailureRegistry,
  PublicFailure,
} from './public-failure';

// ============================================================================
// HTTP Response Types
// ============================================================================

/**
 * HTTP 响应格式
 * 在 Result 基础上添加 HTTP 特有的字段
 *
 * 注意：使用 `ok` 而非 `success`，与 Result/IpcResult 保持一致
 */
export interface HttpResponse<T = unknown> {
  /** 是否成功（与 Result/IpcResult 统一使用 ok） */
  ok: boolean;
  /** HTTP 状态码 */
  code: number;
  /** 响应消息 */
  message: string;
  /** 响应数据（成功时） */
  data?: T;
  /** 错误信息（失败时） */
  error?: {
    code: string;
    message: string;
    details?: ResultErrorDetail[];
    context?: Record<string, unknown>;
    /** Typed public failure semantics; legacy code/message remain for compatibility. */
    failure?: PublicFailure;
  };
  /** 分页信息（列表接口） */
  pagination?: PageInfo;
  /** 时间戳 */
  timestamp: number;
  /** 追踪 ID */
  traceId?: string;
  /** 请求耗时(ms) */
  duration?: number;
}

/**
 * HTTP 响应选项
 */
export interface HttpResponseOptions {
  /** 追踪 ID */
  traceId?: string;
  /** 请求开始时间（用于计算耗时） */
  startTime?: number;
  /** 自定义消息 */
  message?: string;
  /** 分页信息 */
  pagination?: PageInfo;
}

// ============================================================================
// Result Code to HTTP Status Mapping
// ============================================================================

/**
 * Result 错误码到 HTTP 状态码的映射
 */
export const ResultCodeToHttpStatus: Record<string, number> = {
  // 成功
  [ResultCode.OK]: 200,

  // 客户端错误
  [ResultCode.BAD_REQUEST]: 400,
  [ResultCode.UNAUTHORIZED]: 401,
  [ResultCode.FORBIDDEN]: 403,
  [ResultCode.NOT_FOUND]: 404,
  [ResultCode.CONFLICT]: 409,
  [ResultCode.VALIDATION_ERROR]: 422,
  [ResultCode.RATE_LIMITED]: 429,

  // 服务端错误
  [ResultCode.INTERNAL_ERROR]: 500,
  [ResultCode.SERVICE_UNAVAILABLE]: 503,
  [ResultCode.TIMEOUT]: 504,

  // AI transport codes are feature-owned but still need a consistent HTTP
  // projection so API envelopes and SSE/IPC failure categories agree.
  AI_CONFIGURATION_REQUIRED: 422,
  AI_CAPABILITY_UNSUPPORTED: 422,
  AI_CAPABILITY_UNVERIFIED: 422,
  MODEL_NOT_AVAILABLE: 422,
  PROVIDER_AUTH_FAILED: 401,
  CANCELED: 499,
  AI_RUNTIME_TRANSPORT_ERROR: 503,
  AI_RUNTIME_ERROR: 500,
  AI_WORKFLOW_RUNTIME_ERROR: 500,

  // 业务错误（映射为 400）
  [ResultCode.BUSINESS_ERROR]: 400,
  [ResultCode.DOMAIN_ERROR]: 400,

  // 未知错误
  [ResultCode.UNKNOWN]: 500,
};

/** Default HTTP status projection for transport-neutral failure categories. */
export const FailureCategoryToHttpStatus: Readonly<Record<FailureCategory, number>> = {
  validation: 422,
  unauthenticated: 401,
  permission: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  unavailable: 503,
  timeout: 504,
  canceled: 499,
  internal: 500,
};

/** HTTP projection rule for one feature failure code. */
export interface FailureHttpRule {
  readonly status: number;
  readonly retryAfter?: boolean;
}

/** Complete HTTP policy keyed by a feature failure registry. */
export type FailureHttpPolicy<Registry extends FailureRegistry> = Readonly<
  Record<FailureCodeOf<Registry>, FailureHttpRule>
>;

/** Define a complete feature HTTP policy and fail closed on extra keys. */
export function defineFailureHttpPolicy<
  const Registry extends FailureRegistry,
  const Policy extends FailureHttpPolicy<Registry>,
>(registry: Registry, policy: Policy): Policy {
  const expected = Object.keys(registry).sort();
  const received = Object.keys(policy).sort();
  if (
    expected.length !== received.length ||
    expected.some((code, index) => code !== received[index])
  ) {
    throw new Error(
      `Failure HTTP policy codes must exactly match registry codes: expected ${expected.join(', ')}, received ${received.join(', ')}`,
    );
  }
  return Object.freeze({ ...policy }) as Policy;
}

/** Resolve a typed public failure to an HTTP status. */
export function publicFailureToHttpStatus(
  failure: PublicFailure,
  policy?: Readonly<Record<string, FailureHttpRule>>,
): number {
  return policy?.[failure.code]?.status ?? FailureCategoryToHttpStatus[failure.category];
}

/**
 * 获取 Result 对应的 HTTP 状态码
 */
export function getHttpStatusCode(result: Result<unknown>): number {
  if (isOk(result)) {
    return 200;
  }
  if (result.error.failure) {
    return publicFailureToHttpStatus(result.error.failure);
  }
  const code = result.error.code;
  return ResultCodeToHttpStatus[code] ?? 500;
}

/**
 * 从错误码获取 HTTP 状态码
 */
export function errorCodeToHttpStatus(code: string): number {
  return ResultCodeToHttpStatus[code] ?? 500;
}

// ============================================================================
// Result to HTTP Response Converters
// ============================================================================

/**
 * 将 Result 转换为 HTTP 响应格式
 *
 * @example
 * ```ts
 * const result = await userService.getById(id);
 * const httpResponse = toHttpResponse(result, { traceId: req.id });
 * res.status(getHttpStatusCode(result)).json(httpResponse);
 * ```
 */
export function toHttpResponse<T>(
  result: Result<T>,
  options: HttpResponseOptions = {},
): HttpResponse<T> {
  const timestamp = Date.now();
  const duration = options.startTime ? timestamp - options.startTime : undefined;

  if (isOk(result)) {
    return {
      ok: true,
      code: 200,
      message: options.message ?? '操作成功',
      data: result.data,
      pagination: options.pagination,
      timestamp,
      traceId: options.traceId ?? result.meta?.traceId,
      duration: duration ?? result.meta?.duration,
    };
  }

  const httpStatus = result.error.failure
    ? publicFailureToHttpStatus(result.error.failure)
    : errorCodeToHttpStatus(result.error.code);

  return {
    ok: false,
    code: httpStatus,
    message: result.error.message,
    error: {
      code: result.error.code,
      message: result.error.message,
      details: result.error.details,
      context: result.error.context,
      failure: result.error.failure,
    },
    timestamp,
    traceId: options.traceId ?? result.meta?.traceId,
    duration: duration ?? result.meta?.duration,
  };
}

/**
 * 将 HTTP 响应解析回 Result
 * 用于客户端接收 HTTP 响应后的处理
 */
export function fromHttpResponse<T>(response: HttpResponse<T>): Result<T, ResultError> {
  const meta: ResultMeta = {
    traceId: response.traceId,
    duration: response.duration,
    timestamp: response.timestamp,
  };

  if (response.ok) {
    return ok(response.data as T, meta);
  }

  return fail(
    {
      code: response.error?.code ?? ResultCode.UNKNOWN,
      message: response.error?.message ?? response.message,
      details: response.error?.details,
      context: response.error?.context,
      failure: response.error?.failure,
    },
    meta,
  );
}

// ============================================================================
// HTTP Response Builder
// ============================================================================

/**
 * HTTP 响应构建器
 * 提供链式 API 构建 HTTP 响应
 */
export class HttpResponseBuilder {
  private traceId?: string;
  private startTime: number;

  constructor(options: { traceId?: string; startTime?: number } = {}) {
    this.traceId = options.traceId;
    this.startTime = options.startTime ?? Date.now();
  }

  /**
   * 构建成功响应
   */
  success<T>(data: T, message = '操作成功'): HttpResponse<T> {
    return toHttpResponse(ok(data), {
      traceId: this.traceId,
      startTime: this.startTime,
      message,
    });
  }

  /**
   * 构建成功响应（带分页）
   */
  successWithPagination<T>(data: T, pagination: PageInfo, message = '查询成功'): HttpResponse<T> {
    return toHttpResponse(ok(data), {
      traceId: this.traceId,
      startTime: this.startTime,
      message,
      pagination,
    });
  }

  /**
   * 构建错误响应
   */
  error(
    code: string,
    message: string,
    details?: ResultErrorDetail[],
    context?: Record<string, unknown>,
    failure?: PublicFailure,
  ): HttpResponse<never> {
    return toHttpResponse(fail({ code, message, details, context, failure }), {
      traceId: this.traceId,
      startTime: this.startTime,
    });
  }

  /**
   * 从 Result 构建响应
   */
  fromResult<T>(
    result: Result<T>,
    options?: Omit<HttpResponseOptions, 'traceId' | 'startTime'>,
  ): HttpResponse<T> {
    return toHttpResponse(result, {
      traceId: this.traceId,
      startTime: this.startTime,
      ...options,
    });
  }

  // ===== 常用错误快捷方法 =====

  badRequest(message = '请求参数错误', details?: ResultErrorDetail[]): HttpResponse<never> {
    return this.error(ResultCode.BAD_REQUEST, message, details);
  }

  unauthorized(message = '未授权访问'): HttpResponse<never> {
    return this.error(ResultCode.UNAUTHORIZED, message);
  }

  forbidden(message = '禁止访问'): HttpResponse<never> {
    return this.error(ResultCode.FORBIDDEN, message);
  }

  notFound(message = '资源不存在'): HttpResponse<never> {
    return this.error(ResultCode.NOT_FOUND, message);
  }

  conflict(message = '资源冲突'): HttpResponse<never> {
    return this.error(ResultCode.CONFLICT, message);
  }

  validationError(details: ResultErrorDetail[], message = '参数验证失败'): HttpResponse<never> {
    return this.error(ResultCode.VALIDATION_ERROR, message, details);
  }

  internalError(message = '服务器内部错误'): HttpResponse<never> {
    return this.error(ResultCode.INTERNAL_ERROR, message);
  }
}

/**
 * 创建 HTTP 响应构建器
 */
export function createHttpResponseBuilder(options?: {
  traceId?: string;
  startTime?: number;
}): HttpResponseBuilder {
  return new HttpResponseBuilder(options);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 判断是否为客户端错误（4xx）
 */
export function isClientError(result: Result<unknown>): boolean {
  if (isOk(result)) return false;
  const status = errorCodeToHttpStatus(result.error.code);
  return status >= 400 && status < 500;
}

/**
 * 判断是否为服务端错误（5xx）
 */
export function isServerError(result: Result<unknown>): boolean {
  if (isOk(result)) return false;
  const status = errorCodeToHttpStatus(result.error.code);
  return status >= 500;
}
