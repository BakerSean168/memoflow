/**
 * Result HTTP Client — 返回 Result<T>，永不抛出异常
 *
 * 业务层只感知 `Result<T>`，无需 try-catch。
 *
 * 设计原则：
 * 1. 统一返回 `Promise<Result<T>>`，不 reject
 * 2. HTTP 4xx/5xx / 网络异常 → `Result.fail`
 * 3. 成功响应 → 自动剥离 HttpResponse 信封 → `Result.ok(data)`
 * 4. 非标准信封 fail-closed（无 raw dual-track 透传）
 * 5. 泛型安全，IDE 可精确推断 data 类型
 * 6. 401 自动 Token 刷新 + 登出处理
 *
 * @module @memoflow/http-client
 *
 * @example
 * ```ts
 * const result = await resultClient.get<User[]>('/users');
 *
 * if (result.ok) {
 *   console.log(result.data);  // User[]
 * } else {
 *   console.error(result.error.message); // 永远不需要 try-catch
 * }
 * ```
 */

import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import type { Result, ResultError } from '@memoflow/transport-contracts/result';
import { fail, fromHttpResponse } from '@memoflow/transport-contracts/result';
import type { HttpResponse } from '@memoflow/transport-contracts/result';
import type {
  HttpClientConfig,
  IResultHttpClient,
  TokenProvider,
  TokenRefreshHandler,
} from './types';
import { createAxiosInstance } from './axios-instance';
import { classifyNetworkError, statusToResultError } from './result-error';
import {
  buildEmailVerificationBlockedError,
  canAttemptEmailVerificationSensitiveRequest,
  isEmailVerificationRequiredError,
  recordEmailVerificationRequired,
  resourceKeyFromUrl,
} from './email-verification-circuit';

// ============================================================================
// ResultHttpClient
// ============================================================================

/**
 * Result HTTP Client
 *
 * 所有方法返回 `Promise<Result<T>>`，**永不抛出异常**。
 * 无论是 HTTP 错误、网络断开还是超时，都统一为 `Result.fail`。
 *
 * 支持 401 自动 Token 刷新和登出回调。
 *
 * @example
 * ```ts
 * const client = new ResultHttpClient({
 *   baseURL: '/api/v1',
 *   tokenProvider: { getAccessToken: () => authStore.token },
 *   onTokenRefresh: async () => { ... },
 *   onUnauthorized: () => { ... },
 * });
 *
 * // 在 Store 或 Composable 中
 * const result = await client.post<CreateGoalRes>('/goals', formData);
 *
 * if (result.ok) {
 *   // TS 自动推断 result.data 是 CreateGoalRes
 *   toast.success('创建成功');
 * } else {
 *   // 无论 401、500 还是断网都走这里
 *   toast.error(result.error.message); // "网络请求超时" | "参数错误" | ...
 * }
 * ```
 */
export class ResultHttpClient implements IResultHttpClient {
  private readonly axios: AxiosInstance;
  private readonly enableLogging: boolean;
  private readonly onTokenRefresh?: TokenRefreshHandler;
  private readonly onUnauthorized?: () => void;
  private readonly tokenProvider?: TokenProvider;
  private readonly withCredentials: boolean;

  /** 是否正在刷新 Token（防止并发刷新） */
  private isRefreshing = false;
  /** 排队等待 Token 刷新的请求 */
  private refreshQueue: Array<{
    resolve: (token: string) => void;
    reject: (err: unknown) => void;
  }> = [];

  constructor(config: HttpClientConfig = {}) {
    this.axios = createAxiosInstance(config);
    this.enableLogging = config.enableLogging ?? false;
    this.onTokenRefresh = config.onTokenRefresh;
    this.onUnauthorized = config.onUnauthorized;
    this.tokenProvider = config.tokenProvider;
    this.withCredentials = config.axiosConfig?.withCredentials === true;

    // 设置 401 响应拦截器
    this.setupResponseInterceptor();
  }

  // ────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────

  /**
   * 通用请求 — 返回 Result<T>
   */
  async request<T = unknown>(config: AxiosRequestConfig): Promise<Result<T>> {
    return this.execute<T>(() => this.axios.request(config), config.url);
  }

  /**
   * GET 请求
   * @param url - 路径（相对于 baseURL）
   * @param config - 可选的 Axios 配置（params、headers 等）
   */
  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<Result<T>> {
    return this.execute<T>(() => this.axios.get(url, config), url);
  }

  /**
   * POST 请求
   */
  async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<Result<T>> {
    return this.execute<T>(() => this.axios.post(url, data, config), url);
  }

  /**
   * PUT 请求
   */
  async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<Result<T>> {
    return this.execute<T>(() => this.axios.put(url, data, config), url);
  }

  /**
   * PATCH 请求
   */
  async patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<Result<T>> {
    return this.execute<T>(() => this.axios.patch(url, data, config), url);
  }

  /**
   * DELETE 请求
   */
  async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<Result<T>> {
    return this.execute<T>(() => this.axios.delete(url, config), url);
  }

  async stream(
    url: string,
    config?: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: unknown;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    },
  ): Promise<Response> {
    const method = config?.method ?? 'GET';
    const headers = new Headers(config?.headers);
    headers.set('Accept', 'text/event-stream');

    if (config?.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const accessToken = this.tokenProvider?.getAccessToken();
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const requestInit: RequestInit = {
      method,
      headers,
      body: config?.body === undefined ? undefined : JSON.stringify(config.body),
      signal: config?.signal,
      credentials: this.withCredentials ? 'include' : 'same-origin',
    };

    let response = await fetch(this.axios.getUri({ url }), requestInit);
    if (response.status === 401 && this.onTokenRefresh) {
      const refreshedToken = await this.onTokenRefresh();
      if (refreshedToken) {
        headers.set('Authorization', `Bearer ${refreshedToken}`);
        response = await fetch(this.axios.getUri({ url }), requestInit);
      } else {
        this.onUnauthorized?.();
      }
    }

    if (response.status === 401) {
      this.onUnauthorized?.();
    }

    return response;
  }

  // ────────────────────────────────────────
  // 获取底层实例（高级场景）
  // ────────────────────────────────────────

  /** 获取底层 Axios 实例 */
  getAxiosInstance(): AxiosInstance {
    return this.axios;
  }

  // ────────────────────────────────────────
  // 响应拦截器 — 401 Token 刷新处理
  // ────────────────────────────────────────

  /**
   * 设置 401 响应拦截器
   *
   * 当收到 401 时，尝试用 refreshToken 刷新 accessToken
   * 如果刷新成功，重试原请求
   * 如果刷新失败，调用 onUnauthorized 回调（通常用于导航到登录页）
   */
  private setupResponseInterceptor(): void {
    this.axios.interceptors.response.use(
      (response) => response,
      async (error: any) => {
        const { response, config: originalConfig } = error;

        // 401 自动刷新 Token + 重试
        if (response?.status === 401 && this.onTokenRefresh && !originalConfig._retried) {
          return this.handleTokenRefresh(originalConfig);
        }

        // 其他错误直接抛出，交给 execute 方法的 catch 处理
        return Promise.reject(error);
      },
    );
  }

  /**
   * 处理 401 自动刷新 Token
   */
  private async handleTokenRefresh(
    originalConfig: InternalAxiosRequestConfig & { _retried?: boolean },
  ): Promise<any> {
    if (this.isRefreshing) {
      // 已在刷新中 → 排队等待
      return new Promise((resolve, reject) => {
        this.refreshQueue.push({ resolve, reject });
      }).then((newToken) => {
        originalConfig.headers.Authorization = `Bearer ${newToken}`;
        return this.axios.request(originalConfig);
      });
    }

    this.isRefreshing = true;
    originalConfig._retried = true;

    try {
      const newToken = await this.onTokenRefresh!();

      if (!newToken) {
        // 刷新失败 → 通知登出
        this.drainRefreshQueue(new Error('Token 刷新失败'));
        this.onUnauthorized?.();
        return Promise.reject(new Error('Token 刷新失败'));
      }

      // 刷新成功 → 重试原请求 + 放行排队请求
      originalConfig.headers.Authorization = `Bearer ${newToken}`;
      this.drainRefreshQueue(null, newToken);
      return this.axios.request(originalConfig);
    } catch (refreshError) {
      this.drainRefreshQueue(refreshError);
      this.onUnauthorized?.();
      return Promise.reject(refreshError);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * 清空刷新队列
   */
  private drainRefreshQueue(error: unknown, token?: string): void {
    for (const pending of this.refreshQueue) {
      if (error) {
        pending.reject(error);
      } else {
        pending.resolve(token!);
      }
    }
    this.refreshQueue = [];
  }

  // ────────────────────────────────────────
  // Private — 核心执行逻辑
  // ────────────────────────────────────────

  /**
   * 统一执行入口
   *
   * 所有请求都经过这里：
   * 1. 调用 axios（可能成功 / 失败）
   * 2. 成功 → 解析响应 → ok(data)
   * 3. 失败 → 分类错误 → fail(error)
   * 4. **永远 resolve**，不 reject
   * 5. EMAIL_VERIFICATION_REQUIRED → session fuse（同资源 ≤2 次真实请求）
   */
  private async execute<T>(
    requestFn: () => Promise<AxiosResponse>,
    resourceHint?: string,
  ): Promise<Result<T>> {
    const resource = resourceKeyFromUrl(resourceHint);

    // Session fuse: skip transport once this resource exhausted EMAIL_VERIFICATION budget.
    // Only short-circuit resources that already recorded a verification failure
    // (hitCounts > 0 or blocked). Unseen resources always attempt once.
    if (!canAttemptEmailVerificationSensitiveRequest(resource)) {
      const blocked = buildEmailVerificationBlockedError(resource);
      // Keep extras in context so ResultError stays schema-compatible.
      return fail({
        code: blocked.code,
        message: blocked.message,
        context: {
          domainCode: blocked.domainCode,
          messageKey: blocked.messageKey,
          shortCircuited: true,
          resource: blocked.resource,
        },
      });
    }

    try {
      const response = await requestFn();

      if (this.enableLogging) {
        console.debug(`[HTTP] ← ${response.status} ${response.config.url ?? ''}`);
      }

      return this.handleSuccess<T>(response);
    } catch (error: any) {
      return this.handleError<T>(error, resource);
    }
  }

  /**
   * 处理成功响应（HTTP 2xx）
   */
  private handleSuccess<T>(response: AxiosResponse): Result<T> {
    const data = response.data;

    // First-party MemoFlow APIs always serialize Result as HttpResponse.
    // No raw dual-track passthrough for non-envelope bodies.
    if (this.isHttpResponseEnvelope(data)) {
      return fromHttpResponse<T>(data as HttpResponse<T>);
    }

    return fail({
      code: 'INTERNAL_ERROR',
      message:
        'HTTP response missing standard Result envelope (raw dual-track payloads are not accepted)',
    });
  }

  /**
   * 处理失败响应（HTTP != 2xx | 网络异常）
   *
   * 🌟 核心：返回 Result.fail 而非 throw/reject
   */
  private handleError<T>(error: any, resourceHint?: string): Result<T> {
    const { response, message, config } = error;
    const resource = resourceKeyFromUrl(resourceHint ?? config?.url ?? response?.config?.url);

    // ── A. 有 HTTP 响应 (4xx / 5xx) ──
    if (response) {
      const errorData = response.data;

      // A1. 后端返回了标准 HttpResponse 信封
      if (this.isHttpResponseEnvelope(errorData)) {
        const result = fromHttpResponse<T>(errorData as HttpResponse<T>);
        if (!result.ok && isEmailVerificationRequiredError(result.error)) {
          recordEmailVerificationRequired(resource);
          const err = result.error;
          const domain =
            typeof err.context?.domainCode === 'string' ? err.context.domainCode : undefined;
          if (
            domain === 'EMAIL_VERIFICATION_REQUIRED' &&
            err.context?.messageKey !== 'errors.EMAIL_VERIFICATION_REQUIRED'
          ) {
            return fail({
              ...err,
              context: {
                ...err.context,
                domainCode: domain,
                messageKey: 'errors.EMAIL_VERIFICATION_REQUIRED',
              },
            });
          }
        }
        return result;
      }

      // A2. 非标准格式 → 根据 HTTP 状态码构造
      const resultError = statusToResultError(response.status, message);
      return fail<ResultError>({
        code: resultError.code,
        message: resultError.message,
        cause: error,
      }) as Result<T>;
    }

    // ── B. 网络异常 (断网 / DNS / 超时) ──
    return this.createNetworkFailure<T>(error);
  }

  // ────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────

  /** 判断是否为后端标准 HttpResponse 信封（与 IpcResult 一样要求 ok + data/error 形状） */
  private isHttpResponseEnvelope(data: unknown): data is HttpResponse {
    if (data === null || typeof data !== 'object') {
      return false;
    }
    const envelope = data as Record<string, unknown>;
    if (typeof envelope.ok !== 'boolean') {
      return false;
    }
    if (envelope.ok === true) {
      return 'data' in envelope;
    }
    return 'error' in envelope || typeof envelope.message === 'string';
  }

  /** 创建网络异常的 Result.fail */
  private createNetworkFailure<T>(cause: unknown): Result<T> {
    const resultError = classifyNetworkError(cause);
    return fail<ResultError>({
      code: resultError.code,
      message: resultError.message,
      cause,
    }) as Result<T>;
  }
}
