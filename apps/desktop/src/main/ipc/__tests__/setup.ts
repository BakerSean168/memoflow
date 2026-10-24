/**
 * IPC 测试设置文件
 *
 * 初始化测试环境，配置全局 mock
 */

import { delay } from '@memoflow/utils/frontend';
import { vi, beforeEach, afterEach } from 'vitest';

// Mock Electron once here so handler tests can focus on registration and
// argument flow instead of rebuilding the host process for every spec.
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  app: {
    getPath: vi.fn(() => '/mock/path'),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  BrowserWindow: vi.fn(),
}));

// Clear call history between tests but keep the shared module mock shape stable.
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Lightweight globals keep older IPC specs readable without importing helpers
// into every file. Prefer explicit imports for new non-trivial helpers.
declare global {
  var testHelpers: {
    createMockAccountId: () => string;
    delay: (ms: number) => Promise<void>;
  };
}

globalThis.testHelpers = {
  createMockAccountId: () => `account-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  delay, // Residual 1192: dual retired onto utils frontend sole
};
