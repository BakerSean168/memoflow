/**
 * @file Main Process Utilities Module
 * @description
 * Exports utility functions and classes used throughout the main process, including:
 * - Pagination helpers
 * - Memory monitoring
 * - IPC caching
 * - IPC data compression
 * - IPC handler creation and registration
 *
 * @module utils
 */

// Pagination
export {
  normalizePaginationParams,
  calculateOffset,
  createPaginatedResult,
  paginateArray,
  normalizeCursorParams,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type PaginationParams,
  type PaginatedResult,
  type CursorPaginationParams,
  type CursorPaginatedResult,
} from './pagination';

// Memory Monitor
export {
  MemoryMonitor,
  getMemoryMonitor,
  registerMemoryMonitorIpcHandlers,
  initMemoryMonitorForDev,
} from './memory-monitor';

// IPC Cache
export {
  IpcCache,
  getIpcCache,
  withCache,
  invalidatesCache,
  registerCacheIpcHandlers,
} from './ipc-cache';

// Assets
export { resolveAssetPath } from './asset-path';

// Dev runtime
export {
  getDesktopDevServerUrl,
  getDesktopDevServerUrlOrDefault,
  usesDesktopViteDevServer,
  isDesktopDevelopmentRuntime,
} from './dev-runtime';

// Residual 947: HTTP Result envelope type guards (auth + knowledge remote gateways).
export { isRecord, hasDataKey } from './http-envelope-guards';
