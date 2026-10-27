import { CrossPlatformEventBus } from './cross-platform-event-bus';
import type { AppEventRegistry } from '@memoflow/host-runtime';

// ===================== Runtime-local 事件总线 =====================

/**
 * 当前 JavaScript runtime 内的应用事件总线（具体业务实现）。
 *
 * 保留 `GlobalEventBus` 类名以维持现有源码兼容，但这里的 global 仅表示当前
 * Node/Electron/Browser runtime 内的单例，不表示跨进程、跨设备或分布式总线。
 * 底层 async delivery 由 Emittery 提供。
 */
export class GlobalEventBus extends CrossPlatformEventBus<AppEventRegistry> {
  constructor() {
    super();
    this.setDebugMode(process.env.NODE_ENV === 'development');
  }
}

/**
 * 当前 JavaScript runtime 内唯一的事件总线实例。
 *
 * API process、Electron main、Browser renderer 各自拥有独立 runtime；跨进程通信
 * 继续使用 HTTP / IPC / SSE / PowerSync，durable integration event 使用 Outbox/Queue。
 *
 * 使用示例（ADR-033 范式 A · 通知式反应）:
 * 1. 发布事件: eventBus.send('user:login', { userId: '1', timestamp: Date.now() })
 * 2. 订阅事件: eventBus.on('user:login', (e) => console.log(e.userId))
 *
 * 需要请求-响应（拿返回值）请走 Port（同进程）或 @memoflow/ipc-client / HTTP（跨进程），
 * 不要在事件总线上做 RPC。
 */
export const eventBus = new GlobalEventBus();
