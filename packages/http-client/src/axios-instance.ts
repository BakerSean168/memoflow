/**
 * Axios Instance Factory
 *
 * 创建和配置 Axios 实例的工厂函数。
 * 集中管理请求拦截器（Token 注入）和基础配置。
 *
 * 设计原则：
 * - 实例与业务逻辑解耦：响应处理由 ResultHttpClient 负责
 * - 只在此处做「请求侧」公共操作（注入 Token、日志等）
 * - 响应拦截器留给上层 Client wrapper 按需注册
 *
 * @module @memoflow/http-client
 */

import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { DEFAULT_HTTP_CLIENT_CONFIG, type HttpClientConfig } from './types';

/**
 * 创建一个预配置的 Axios 实例
 *
 * 只注册【请求拦截器】— 负责 Token 注入和请求日志。
 * 响应拦截器由 ResultHttpClient 注册。
 *
 * @param config - 客户端配置
 * @returns 配置好的 Axios 实例
 *
 * @example
 * ```ts
 * const instance = createAxiosInstance({
 *   baseURL: '/api/v1',
 *   timeout: 15000,
 *   axiosConfig: { withCredentials: true },
 * });
 * ```
 */
export function createAxiosInstance(config: HttpClientConfig = {}): AxiosInstance {
  const {
    baseURL = DEFAULT_HTTP_CLIENT_CONFIG.baseURL,
    timeout = DEFAULT_HTTP_CLIENT_CONFIG.timeout,
    tokenProvider,
    enableLogging = DEFAULT_HTTP_CLIENT_CONFIG.enableLogging,
    axiosConfig,
  } = config;

  // ────────────────────────────────────────
  // 1. 创建实例
  // ────────────────────────────────────────
  const instance = axios.create({
    baseURL,
    timeout,
    headers: {
      'Content-Type': 'application/json',
    },
    // 允许外部传入额外配置（如 withCredentials: true）
    ...axiosConfig,
  });

  // ────────────────────────────────────────
  // 2. 请求拦截器 — Token 注入
  // ────────────────────────────────────────
  instance.interceptors.request.use(
    (requestConfig: InternalAxiosRequestConfig) => {
      // 注入 Bearer Token
      if (tokenProvider) {
        const token = tokenProvider.getAccessToken();
        if (token && requestConfig.headers) {
          requestConfig.headers.Authorization = `Bearer ${token}`;
        }
      }

      // 开发日志
      if (enableLogging) {
        console.debug(
          `[HTTP] → ${requestConfig.method?.toUpperCase()} ${requestConfig.baseURL ?? ''}${requestConfig.url ?? ''}`,
        );
      }

      return requestConfig;
    },
    (error) => Promise.reject(error),
  );

  return instance;
}
