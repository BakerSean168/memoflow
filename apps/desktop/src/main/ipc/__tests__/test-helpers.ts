/**
 * IPC 测试辅助工具
 *
 * 提供测试常用的辅助函数和类型。
 * 这些 helper 只服务于 handler 注册和参数断言，不负责模拟完整 Electron 生命周期。
 */

import { expect } from 'vitest';

/**
 * 创建通用的 IPC handler 注册捕获器。
 * 用它可以验证通道是否注册、注册到了哪个 handler，而不用真正启动应用。
 */
export function createHandlerCapture() {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

  return {
    handlers,

    /**
     * 设置 ipcMain.handle 的 mock 实现来捕获注册
     */
    setup() {
      const { ipcMain } = require('electron');
      ipcMain.handle.mockImplementation(
        (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
          handlers.set(channel, handler);
        },
      );
    },

    /**
     * 获取已注册的处理器
     */
    get(channel: string) {
      return handlers.get(channel);
    },

    /**
     * 检查通道是否已注册
     */
    has(channel: string) {
      return handlers.has(channel);
    },

    /**
     * 获取所有已注册的通道
     */
    channels() {
      return Array.from(handlers.keys());
    },

    /**
     * 清除所有注册
     */
    clear() {
      handlers.clear();
    },
  };
}

/**
 * 测试错误响应
 */
export async function expectAsyncError(
  fn: () => Promise<unknown>,
  errorMessage?: string | RegExp,
): Promise<void> {
  let error: Error | null = null;
  try {
    await fn();
  } catch (e) {
    error = e as Error;
  }

  expect(error).not.toBeNull();
  if (errorMessage) {
    if (typeof errorMessage === 'string') {
      expect(error!.message).toContain(errorMessage);
    } else {
      expect(error!.message).toMatch(errorMessage);
    }
  }
}

/**
 * 创建分页参数
 */
export function createPaginationParams(page = 1, limit = 10) {
  return { page, limit };
}

/**
 * 验证分页响应结构
 */
export function expectPaginatedResponse(response: unknown) {
  expect(response).toHaveProperty('items');
  expect(response).toHaveProperty('total');
  expect(response).toHaveProperty('page');
  expect(response).toHaveProperty('pageSize');
}

/**
 * 创建 mock 账户 ID
 */
export function createMockAccountId(): string {
  return `account-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 创建 mock UUID
 */
export function createMockId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Residual 1192: dual delay retired onto @memoflow/utils/frontend sole.
 */
export { delay } from '@memoflow/utils/frontend';

/**
 * 创建 spy 来验证函数调用顺序
 */
export function createCallOrderTracker() {
  const calls: string[] = [];

  return {
    track(name: string) {
      return (..._args: unknown[]) => {
        calls.push(name);
      };
    },
    getCalls() {
      return [...calls];
    },
    clear() {
      calls.length = 0;
    },
  };
}
