/**
 * Result IPC Client — 返回 Result<T>，永不抛出异常
 *
 * 与 `ResultHttpClient` 完全对等的 IPC 版本：
 *
 * | 特性         | ResultHttpClient                | ResultIpcClient                 |
 * |-------------|--------------------------------|--------------------------------|
 * | 入口方法     | `.post<T>(url, data)`          | `.invoke<T>(channel, data)`    |
 * | 返回类型     | `Promise<Result<T>>`           | `Promise<Result<T>>`           |
 * | 异常处理     | 永不 reject                     | 永不 reject                     |
 * | 错误响应     | HTTP 4xx/5xx → Result.fail     | IpcResult.error → Result.fail  |
 * | 底层异常     | 网络断开 → Result.fail          | 进程崩溃 → Result.fail          |
 *
 * 这实现了"类 tRPC"的统一接口：
 * ```ts
 * // HTTP (Web)
 * const result = await httpClient.post<Rule>('/rules', data);
 *
 * // IPC (Desktop)
 * const result = await ipcClient.invoke<TaskPlan>('task:plan:create', data);
 *
 * // 消费方式完全一致
 * if (result.ok) {
 *   console.log(result.data); // Rule
 * } else {
 *   console.error(result.error.message); // 永不需要 try-catch
 * }
 * ```
 *
 * @module @memoflow/ipc-client
 */

import type { Result, ResultError } from '@memoflow/contracts/result';
import {
  fail,
  ResultCode,
  fromIpcResult,
  type IpcResult,
  isIpcResultEnvelope,
} from '@memoflow/contracts/result';
import type { ElectronBridge, IpcClientConfig, IResultIpcClient } from './types';
import { DEFAULT_IPC_CLIENT_CONFIG } from './types';

// ============================================================================
// ResultIpcClient
// ============================================================================

/**
 * Result IPC Client — 所有方法返回 `Promise<Result<T>>`，永不抛出异常
 *
 * 无论是 IPC 错误、进程崩溃还是超时，都统一为 `Result.fail`。
 *
 * @example
 * ```ts
 * import { ResultIpcClient } from '@memoflow/ipc-client';
 *
 * const client = new ResultIpcClient();
 *
 * // 在 Store 或 Composable 中
 * const result = await client.invoke<Goal[]>('goal:list');
 *
 * if (result.ok) {
 *   goals.value = result.data;
 * } else {
 *   // 无论什么错误都走这里 — 不需要 try-catch
 *   toast.error(result.error.message);
 * }
 * ```
 */
export class ResultIpcClient implements IResultIpcClient {
  private bridge: ElectronBridge | undefined;
  private readonly enableLogging: boolean;
  private readonly timeout: number;

  constructor(config: IpcClientConfig) {
    this.bridge = config.bridge;
    this.enableLogging = config.enableLogging ?? DEFAULT_IPC_CLIENT_CONFIG.enableLogging;
    this.timeout = config.timeout ?? DEFAULT_IPC_CLIENT_CONFIG.timeout;
  }

  // ────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────

  /**
   * 调用主进程 IPC handler，返回 `Result<T>`
   *
   * @param channel - IPC channel 名称
   * @param args - 传给 handler 的参数
   * @returns `Promise<Result<T>>` — 永远 resolve，不 reject
   *
   * @example
   * ```ts
   * const result = await client.invoke<CreateGoalRes>('goal:create', formData);
   *
   * if (result.ok) {
   *   toast.success('创建成功');
   *   router.push(`/goals/${result.data.id}`);
   * } else {
   *   toast.error(result.error.message);
   * }
   * ```
   */
  async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<Result<T>> {
    // Bridge 不可用（非 Electron 环境）
    if (!this.bridge) {
      return fail<ResultError>({
        code: ResultCode.INTERNAL_ERROR,
        message: 'Electron IPC bridge not available. Are you running in Electron?',
      }) as Result<T>;
    }

    if (this.enableLogging) {
      console.debug(`[IPC] → ${channel}`, args.length > 0 ? args : '');
    }

    try {
      const response = await this.invokeWithTimeout(channel, ...args);
      return this.handleResponse<T>(channel, response);
    } catch (error: any) {
      return this.handleError<T>(channel, error);
    }
  }

  // ────────────────────────────────────────
  // 获取底层实例（高级场景）
  // ────────────────────────────────────────

  /** 获取底层 ElectronBridge 实例 */
  getBridge(): ElectronBridge | undefined {
    return this.bridge;
  }

  // ────────────────────────────────────────
  // Private — 核心执行逻辑
  // ────────────────────────────────────────

  /**
   * 带超时的 IPC 调用
   */
  private invokeWithTimeout(channel: string, ...args: unknown[]): Promise<unknown> {
    const invokePromise = this.bridge!.invoke(channel, ...args);

    if (this.timeout <= 0) {
      return invokePromise;
    }

    return Promise.race([
      invokePromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject({ __timeout: true, channel });
        }, this.timeout);
      }),
    ]);
  }

  /**
   * 处理成功的 IPC 响应
   */
  private handleResponse<T>(channel: string, response: unknown): Result<T> {
    if (isIpcResultEnvelope(response)) {
      if (this.enableLogging) {
        const ipc = response as IpcResult<T>;
        console.debug(`[IPC] ← ${channel} ${ipc.ok ? '✓' : '✗'}`);
      }

      return fromIpcResult<T>(response as IpcResult<T>);
    }

    if (this.enableLogging) {
      console.debug(`[IPC] ← ${channel} ✗ (non-envelope)`);
    }
    return fail<ResultError>({
      code: ResultCode.INTERNAL_ERROR,
      message: `IPC response for ${channel} is not an IpcResult envelope`,
    }) as Result<T>;
  }

  /**
   * 处理异常 — 返回 Result.fail，永不 reject
   */
  private handleError<T>(channel: string, error: any): Result<T> {
    if (this.enableLogging) {
      console.debug(`[IPC] ← ${channel} ✗ (exception)`, error);
    }

    // 超时
    if (error?.__timeout) {
      return fail<ResultError>({
        code: ResultCode.TIMEOUT,
        message: `IPC 调用超时 (${this.timeout}ms): ${channel}`,
      }) as Result<T>;
    }

    // 主进程崩溃、未注册 handler 和其他通信异常均是内部 transport failure。
    // Electron 的人类可读 message 不属于可分支协议。
    return fail<ResultError>({
      code: ResultCode.INTERNAL_ERROR,
      message: 'IPC 调用异常',
      cause: error,
    }) as Result<T>;
  }

  // ────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────
}
