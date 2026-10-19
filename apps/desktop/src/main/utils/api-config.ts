/**
 * API Configuration for Desktop Main Process
 *
 * 在 Electron 主进程中获取 API 配置
 * 支持环境变量和默认配置
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { getSharedPathResolver } from '../runtime-init';

/**
 * API 配置
 */
export interface ApiConfig {
  baseUrl: string;
  timeout: number;
}

interface DesktopRuntimeConfigFile {
  apiBaseUrl?: string;
  apiOrigin?: string;
  apiPath?: string;
}

const DEFAULT_API_PATH = '/api/v1';
const PACKAGED_DEFAULT_API_ORIGIN = 'https://memoflow.bakersean.top';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
}

function normalizeBaseUrl(baseUrl: string, defaultPath = DEFAULT_API_PATH): string {
  const trimmed = trimTrailingSlash(baseUrl);

  if (/\/api\/v\d+$/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}${defaultPath}`;
}

function getApiScheme(hostOrUrl: string): 'http' | 'https' {
  return /localhost|127\.0\.0\.1/i.test(hostOrUrl) ? 'http' : 'https';
}

function tryReadRuntimeConfig(configPath: string): DesktopRuntimeConfigFile | null {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as DesktopRuntimeConfigFile;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function resolveRuntimeConfigBaseUrl(): string | null {
  const candidatePaths = [getSharedPathResolver().runtimeConfigPath];

  if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
    candidatePaths.push(path.join(process.resourcesPath, 'desktop-runtime.json'));
  }

  for (const configPath of candidatePaths) {
    const config = tryReadRuntimeConfig(configPath);
    if (!config) {
      continue;
    }

    if (typeof config.apiBaseUrl === 'string' && isAbsoluteHttpUrl(config.apiBaseUrl)) {
      return normalizeBaseUrl(config.apiBaseUrl, DEFAULT_API_PATH);
    }

    if (typeof config.apiOrigin === 'string' && isAbsoluteHttpUrl(config.apiOrigin)) {
      const apiPath =
        typeof config.apiPath === 'string' && config.apiPath.trim().length > 0
          ? config.apiPath
          : DEFAULT_API_PATH;
      return normalizeBaseUrl(config.apiOrigin, apiPath);
    }
  }

  return null;
}

/**
 * 获取 API 基础 URL
 *
 * 优先级：
 * 1. 环境变量 MEMOFLOW_API_URL
 * 2. 环境变量 VITE_API_BASE_URL (开发模式)
 * 3. 默认远程服务器
 */
export function getApiBaseUrl(): string {
  const {
    MEMOFLOW_API_URL,
    API_BASE_URL,
    VITE_API_BASE_URL,
    VITE_API_URL,
    PROXY_TARGET_URL,
    API_DOMAIN,
  } = process.env;

  const directBaseUrl = MEMOFLOW_API_URL || API_BASE_URL;
  if (directBaseUrl) {
    return normalizeBaseUrl(directBaseUrl);
  }

  const runtimeConfigBaseUrl = resolveRuntimeConfigBaseUrl();
  if (runtimeConfigBaseUrl) {
    return runtimeConfigBaseUrl;
  }

  if (VITE_API_BASE_URL && isAbsoluteHttpUrl(VITE_API_BASE_URL)) {
    return normalizeBaseUrl(VITE_API_BASE_URL, '');
  }

  const basePath =
    VITE_API_BASE_URL && VITE_API_BASE_URL.startsWith('/') ? VITE_API_BASE_URL : '/api/v1';

  if (VITE_API_URL) {
    return normalizeBaseUrl(VITE_API_URL, basePath);
  }

  if (PROXY_TARGET_URL) {
    return normalizeBaseUrl(PROXY_TARGET_URL, basePath);
  }

  if (API_DOMAIN) {
    const normalizedDomain = API_DOMAIN.replace(/^https?:\/\//, '');
    return normalizeBaseUrl(`${getApiScheme(normalizedDomain)}://${normalizedDomain}`, basePath);
  }

  if (!app.isPackaged && VITE_API_BASE_URL && isAbsoluteHttpUrl(VITE_API_BASE_URL)) {
    return normalizeBaseUrl(VITE_API_BASE_URL, '');
  }

  if (app.isPackaged) {
    return normalizeBaseUrl(PACKAGED_DEFAULT_API_ORIGIN, DEFAULT_API_PATH);
  }

  throw new Error(
    'Desktop API base URL is not configured. Set MEMOFLOW_API_URL, API_BASE_URL, VITE_API_URL, PROXY_TARGET_URL, or API_DOMAIN.',
  );
}

/** Public Web origin used for browser-completed authentication journeys. */
export function getWebAppUrl(): string {
  const configured = process.env.MEMOFLOW_WEB_URL
    || process.env.WEB_APP_URL
    || process.env.VITE_WEB_URL;
  if (configured && isAbsoluteHttpUrl(configured)) {
    return trimTrailingSlash(configured);
  }

  const corsOrigin = process.env.CORS_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .find((origin) => isAbsoluteHttpUrl(origin));
  if (corsOrigin) return trimTrailingSlash(corsOrigin);

  return new URL(getApiBaseUrl()).origin;
}

/**
 * 获取完整 API 配置
 */
export function getApiConfig(): ApiConfig {
  return {
    baseUrl: getApiBaseUrl(),
    timeout: Number(process.env.VITE_API_TIMEOUT || process.env.API_TIMEOUT) || 30000,
  };
}

/**
 * 创建完整的 API URL
 */
export function createApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl();
  // 确保路径以 / 开头
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
