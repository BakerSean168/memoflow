/**
 * HTTP Client Types
 *
 * 通用 HTTP 客户端接口与配置类型定义。
 * 不依赖任何具体实现（Axios / Fetch / IPC），
 * 是所有 HTTP 适配器的抽象契约。
 *
 * @module @memoflow/http-client
 */

import type { AxiosRequestConfig } from 'axios';

// ============================================================================
// Result HTTP Client Interface
// ============================================================================

/**
 * Result HTTP Client 接口
 *
 * 所有方法返回 `Promise<Result<T>>`，永不抛出异常。
 * 模块 HTTP adapters 依赖此接口；实现为 ResultHttpClient。
 * Throw 风格 IHttpClient / AxiosHttpClient 双轨已删除。
 */
export interface IResultHttpClient {
  get<T = unknown>(
    url: string,
    config?: { params?: Record<string, unknown>; signal?: AbortSignal },
  ): Promise<import('@memoflow/contracts/result').Result<T>>;
  post<T = unknown>(url: string, data?: unknown, config?: { params?: Record<string, unknown> }): Promise<import('@memoflow/contracts/result').Result<T>>;
  put<T = unknown>(url: string, data?: unknown, config?: { params?: Record<string, unknown> }): Promise<import('@memoflow/contracts/result').Result<T>>;
  patch<T = unknown>(url: string, data?: unknown, config?: { params?: Record<string, unknown> }): Promise<import('@memoflow/contracts/result').Result<T>>;
  delete<T = unknown>(
    url: string,
    config?: { params?: Record<string, unknown>; data?: unknown },
  ): Promise<import('@memoflow/contracts/result').Result<T>>;
  stream(
    url: string,
    config?: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: unknown;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    },
  ): Promise<Response>;
}

// ============================================================================
// Axios HTTP Client Configuration
// ============================================================================

/**
 * Token 提供者接口
 *
 * 用于解耦 Token 获取策略。
 * 可以从 AuthContainer.tokenStorage、Pinia Store 或 localStorage 获取。
 */
export interface TokenProvider {
  /** 获取当前的 Access Token */
  getAccessToken(): string | null;
  /** 获取 Refresh Token（用于自动刷新） */
  getRefreshToken?(): string | null;
}

/**
 * Token 刷新回调
 *
 * 当 401 发生时用于自动重试机制
 */
export type TokenRefreshHandler = () => Promise<string | null>;

/**
 * ResultHttpClient / createAxiosInstance 配置
 */
export interface HttpClientConfig {
  /** API 基础 URL（默认: '/api/v1'） */
  baseURL?: string;
  /** 请求超时时间（毫秒，默认: 10000） */
  timeout?: number;
  /** Token 提供者 */
  tokenProvider?: TokenProvider;
  /** Token 刷新处理器（用于 401 自动重试） */
  onTokenRefresh?: TokenRefreshHandler;
  /** 401 未授权回调（例如跳转登录页） */
  onUnauthorized?: () => void;
  /** 额外的 Axios 配置 */
  axiosConfig?: AxiosRequestConfig;
  /** 是否开启请求/响应日志（开发环境默认开启） */
  enableLogging?: boolean;
}

/**
 * 默认配置
 */
export const DEFAULT_HTTP_CLIENT_CONFIG: Required<
  Pick<HttpClientConfig, 'baseURL' | 'timeout' | 'enableLogging'>
> = {
  baseURL: '/api/v1',
  timeout: 10000,
  enableLogging: false,
};
