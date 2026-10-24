/**
 * Electron IPC Mock
 *
 * 提供 ipcMain 的模拟实现，用于测试 IPC 处理器
 */

import { vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';

type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

/**
 * 创建 ipcMain 模拟对象
 */
export function createMockIpcMain() {
  const handlers = new Map<string, IpcHandler>();
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  const mockIpcMain = {
    /**
     * 注册 invoke 处理器
     */
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    }),

    /**
     * 注册事件监听器
     */
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      if (!listeners.has(channel)) {
        listeners.set(channel, []);
      }
      listeners.get(channel)!.push(listener);
    }),

    /**
     * 移除处理器
     */
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),

    /**
     * 移除所有监听器
     */
    removeAllListeners: vi.fn((channel?: string) => {
      if (channel) {
        listeners.delete(channel);
      } else {
        listeners.clear();
      }
    }),

    // ===== 测试辅助方法 =====

    /**
     * 获取已注册的处理器
     */
    getHandler(channel: string): IpcHandler | undefined {
      return handlers.get(channel);
    },

    /**
     * 获取所有已注册的通道
     */
    getRegisteredChannels(): string[] {
      return Array.from(handlers.keys());
    },

    /**
     * 调用处理器（模拟 ipcRenderer.invoke）
     */
    async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No handler registered for channel: ${channel}`);
      }
      const event = createMockEvent();
      return handler(event, ...args);
    },

    /**
     * 检查通道是否已注册
     */
    hasHandler(channel: string): boolean {
      return handlers.has(channel);
    },

    /**
     * 清除所有注册
     */
    clear(): void {
      handlers.clear();
      listeners.clear();
      mockIpcMain.handle.mockClear();
      mockIpcMain.on.mockClear();
      mockIpcMain.removeHandler.mockClear();
      mockIpcMain.removeAllListeners.mockClear();
    },
  };

  return mockIpcMain;
}

/**
 * 创建模拟的 IpcMainInvokeEvent
 */
export function createMockEvent(
  options: {
    sender?: { id: number };
    frameId?: number;
    processId?: number;
  } = {},
): IpcMainInvokeEvent {
  return {
    sender: options.sender ?? ({ id: 1 } as unknown as Electron.WebContents),
    frameId: options.frameId ?? 1,
    processId: options.processId ?? 1,
  } as IpcMainInvokeEvent;
}

/**
 * 创建 ipcRenderer 模拟对象（用于客户端测试）
 */
export function createMockIpcRenderer(mockIpcMain: ReturnType<typeof createMockIpcMain>) {
  return {
    invoke: vi.fn(async (channel: string, ...args: unknown[]) => {
      return mockIpcMain.invoke(channel, ...args);
    }),
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  };
}

export type MockIpcMain = ReturnType<typeof createMockIpcMain>;
export type MockIpcRenderer = ReturnType<typeof createMockIpcRenderer>;
