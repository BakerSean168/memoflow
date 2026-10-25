/**
 * 前端API客户端工具函数
 */

/**
 * 获取环境配置
 */
export interface EnvironmentConfig {
  apiBaseUrl: string;
  uploadBaseUrl: string;
  timeout: number;
  enableMock: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
}

/** 跨平台环境变量访问类型 */
type GlobalWithEnv = typeof globalThis & {
  import?: { meta?: { env?: Record<string, string | boolean> } };
  process?: { env?: Record<string, string> };
};

function getEnv(): Record<string, string | boolean | undefined> {
  return (
    (globalThis as GlobalWithEnv).import?.meta?.env ??
    (globalThis as GlobalWithEnv).process?.env ??
    {}
  );
}

/**
 * 获取当前环境配置
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const env = getEnv();

  const validLogLevels: EnvironmentConfig['logLevel'][] = [
    'debug',
    'info',
    'warn',
    'error',
    'silent',
  ];
  const rawLogLevel = env.VITE_LOG_LEVEL;
  const logLevel: EnvironmentConfig['logLevel'] =
    typeof rawLogLevel === 'string' && (validLogLevels as string[]).includes(rawLogLevel)
      ? (rawLogLevel as EnvironmentConfig['logLevel'])
      : 'info';

  const config: EnvironmentConfig = {
    apiBaseUrl: (env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:3000/api/v1',
    uploadBaseUrl:
      (env.VITE_UPLOAD_BASE_URL as string | undefined) || 'http://localhost:3000/api/v1/upload',
    timeout: Number(env.VITE_API_TIMEOUT) || 10000,
    enableMock: env.VITE_ENABLE_MOCK === 'true',
    logLevel,
  };

  return config;
}

/**
 * 创建认证头
 */
export function createAuthHeader(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

/**
 * 检查是否为开发环境
 */
export function isDevelopment(): boolean {
  const env = getEnv();
  return env.DEV === true || env.DEV === 'true' || env.NODE_ENV === 'development';
}

/**
 * 检查是否为生产环境
 */
export function isProduction(): boolean {
  const env = getEnv();
  return env.PROD === true || env.PROD === 'true' || env.NODE_ENV === 'production';
}

/**
 * 安全地解析JSON
 */
export function safeParseJSON<T = unknown>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

/**
 * 格式化文件大小
 * Residual 1145 keep-boundary: utils formatFileSize — zero → "0 Bytes"; unit ladder
 * Bytes/KB/MB/GB/TB; toFixed(2). Soft residual 1145: app-react file-utils uses "0 B" +
 * B/KB/MB/GB + toFixed(1) (no force-merge).
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 验证文件类型
 */
export function validateFileType(file: File, allowedTypes: string[]): boolean {
  return allowedTypes.includes(file.type);
}

/**
 * 验证文件大小
 */
export function validateFileSize(file: File, maxSize: number): boolean {
  return file.size <= maxSize;
}

/**
 * 生成唯一请求ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建查询字符串
 */
export function createQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') {
      if (Array.isArray(value)) {
        value.forEach((item) => searchParams.append(key, String(item)));
      } else {
        searchParams.append(key, String(value));
      }
    }
  });

  return searchParams.toString();
}

/**
 * Residual 1192: sole delay helper (setTimeout → Promise).
 * Duals in desktop IPC test-helpers and web E2E runner retired onto this sole.
 *
 * 延迟函数（用于重试机制）
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 指数退避延迟计算
 */
export function exponentialBackoff(attempt: number, baseDelay: number = 1000): number {
  return Math.min(baseDelay * Math.pow(2, attempt), 30000); // 最大30秒
}

/**
 * 检查是否为网络错误
 */
export function isNetworkError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const err = error as Record<string, unknown>;
  return (
    !err['response'] ||
    err['code'] === 'NETWORK_ERROR' ||
    err['code'] === 'ECONNABORTED' ||
    err['message'] === 'Network Error'
  );
}

/**
 * 检查是否应该重试
 */
export function shouldRetry(error: unknown, attempt: number, maxAttempts: number): boolean {
  if (attempt >= maxAttempts) return false;

  // 网络错误重试
  if (isNetworkError(error)) return true;

  if (typeof error !== 'object' || error === null) return false;
  const err = error as Record<string, unknown>;
  const response = err['response'] as Record<string, unknown> | undefined;

  // 5xx服务器错误重试
  if (typeof response?.['status'] === 'number' && response['status'] >= 500) return true;

  // 429 限流错误重试
  if (response?.['status'] === 429) return true;

  return false;
}

/**
 * 创建缓存键
 */
export function createCacheKey(
  method: string,
  url: string,
  params?: Record<string, unknown>,
): string {
  const baseKey = `${method.toUpperCase()}:${url}`;

  if (!params) return baseKey;

  const sortedParams = Object.keys(params)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = params[key];
      return result;
    }, {});

  return `${baseKey}:${JSON.stringify(sortedParams)}`;
}

/**
 * 检查缓存是否过期
 */
export function isCacheExpired(timestamp: number, timeout: number): boolean {
  return Date.now() - timestamp > timeout;
}

/**
 * 清理过期缓存
 */
export function cleanExpiredCache<T>(
  cache: Map<string, { data: T; timestamp: number }>,
  timeout: number,
): void {
  const now = Date.now();

  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > timeout) {
      cache.delete(key);
    }
  }
}

/**
 * 深拷贝对象
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (obj instanceof Array) return obj.map((item) => deepClone(item)) as unknown as T;

  if (typeof obj === 'object') {
    const clonedObj = {} as Record<string, unknown>;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clonedObj[key] = deepClone((obj as Record<string, unknown>)[key]);
      }
    }
    return clonedObj as unknown as T;
  }

  return obj;
}

// /**
//  * 节流函数
//  */
// export function throttle<T extends (...args: any[]) => any>(
//   func: T,
//   wait: number,
// ): (...args: Parameters<T>) => void {
//   let timeout: ReturnType<typeof setTimeout> | null = null;
//   let previous = 0;

//   return function (this: any, ...args: Parameters<T>) {
//     const now = Date.now();
//     const remaining = wait - (now - previous);

//     if (remaining <= 0 || remaining > wait) {
//       if (timeout) {
//         clearTimeout(timeout);
//         timeout = null;
//       }
//       previous = now;
//       func.apply(this, args);
//     } else if (!timeout) {
//       timeout = setTimeout(() => {
//         previous = Date.now();
//         timeout = null;
//         func.apply(this, args);
//       }, remaining);
//     }
//   };
// }

// /**
//  * 防抖函数
//  */
// export function debounce<T extends (...args: any[]) => any>(
//   func: T,
//   wait: number,
//   immediate?: boolean,
// ): (...args: Parameters<T>) => void {
//   let timeout: ReturnType<typeof setTimeout> | null = null;

//   return function (this: any, ...args: Parameters<T>) {
//     const callNow = immediate && !timeout;

//     if (timeout) clearTimeout(timeout);

//     timeout = setTimeout(() => {
//       timeout = null;
//       if (!immediate) func.apply(this, args);
//     }, wait);

//     if (callNow) func.apply(this, args);
//   };
// }
