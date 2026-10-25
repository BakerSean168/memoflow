/** 随事件 envelope 传递的投递元数据（at-least-once 幂等去重键等）。 */
export interface EventDeliveryMetadata {
  aggregateId?: string;
  occurredAt?: Date;
  idempotencyKey?: string;
}

import Emittery, { type UnsubscribeFunction } from 'emittery';
import { createLogger } from '../logger';

// 基础类型约束
type EventMap = Record<string, any>;

type RuntimeEventEnvelope = {
  payload: unknown;
  metadata?: EventDeliveryMetadata;
};

type RuntimeEventMap = Record<string, RuntimeEventEnvelope>;

type RuntimeEventHandler<T> = (event: T, metadata?: EventDeliveryMetadata) => void | Promise<void>;

type RegisteredHandler = RuntimeEventHandler<unknown>;

const logger = createLogger('CrossPlatformEventBus');

/**
 * 跨平台单向事件总线。
 *
 * 底层使用 Emittery 的 async-first delivery：每次 `dispatch()` 都拥有独立 Promise，
 * 并发事件不会共享 drain/error 状态。`send()` 保留通知式 fire-and-forget 语义；
 * 需要可靠发布边界的基础设施通过 `dispatch()` 等待本次 delivery 的全部订阅者。
 *
 * 只承载「通知式反应」（ADR-033 范式 A）。同进程请求-响应走 Port（范式 B），
 * 跨进程走 `@memoflow/ipc-client` / HTTP（范式 C）。本总线只在当前 JS runtime
 * 内生效，不承担跨进程可靠投递；durable integration events 继续走 Outbox/Queue。
 *
 * @see docs/architecture/adr/ADR-033-cross-module-communication-patterns.md
 * @see docs/architecture/adr/ADR-064-emittery-runtime-event-delivery.md
 */
export class CrossPlatformEventBus<TEvents extends EventMap = EventMap> {
  private readonly emitter = new Emittery<RuntimeEventMap>();
  private readonly subscriptions = new Map<string, Map<RegisteredHandler, UnsubscribeFunction[]>>();
  private debugEnabled = false;

  /**
   * 发布通知式事件，不等待订阅者完成，也不把订阅者错误冒泡给调用方。
   *
   * 订阅者仍由 Emittery 异步并行执行；失败会被记录，但不会形成未处理的 Promise rejection。
   * 需要把 handler 完成/失败作为可靠交付边界时，应调用 `dispatch()`。
   */
  send<K extends keyof TEvents>(
    eventType: K,
    payload: TEvents[K],
    metadata?: EventDeliveryMetadata,
  ): void {
    void this.dispatch(eventType, payload, metadata).catch(() => undefined);
  }

  /**
   * 发布并等待「本次事件」的全部订阅者完成。
   *
   * Emittery 为每次 emit 返回独立 Promise，因此并发 dispatch 之间不会共享 pending/error
   * 状态。任一 handler throw/reject 时，Emittery 会在所有并行 handler 都完成后以
   * AggregateError 拒绝该 Promise，可靠 publisher 可据此阻止 ack 并进入 retry/fallback。
   */
  async dispatch<K extends keyof TEvents>(
    eventType: K,
    payload: TEvents[K],
    metadata?: EventDeliveryMetadata,
  ): Promise<void> {
    const type = eventType as string;
    if (this.debugEnabled) logger.debug(`📤 Dispatch: ${type}`, payload);

    try {
      await this.emitter.emit(type, { payload, metadata });
    } catch (error) {
      const aggregateErrors = this.getAggregateErrors(error);
      this.logDeliveryFailure(type, error);

      // Emittery always wraps listener failures in AggregateError. MemoFlow historically
      // surfaced the original handler error when only one subscriber failed, and reliable
      // outbox publishers persist that message as diagnostic state. Preserve that contract
      // while keeping AggregateError when multiple independent subscribers fail.
      if (aggregateErrors?.length === 1) {
        throw aggregateErrors[0];
      }
      throw error;
    }
  }

  /**
   * 订阅单向事件。
   *
   * 保留 MemoFlow 原有 payload-first handler 契约；Emittery 的内部 event envelope
   * 不泄漏到业务层。第二参数 metadata 仅供需要投递元数据的基础设施消费者使用。
   */
  on<K extends keyof TEvents>(eventType: K, handler: RuntimeEventHandler<TEvents[K]>): this {
    const type = eventType as string;
    if (this.debugEnabled) logger.debug(`👂 On: ${type}`);

    const registeredHandler = handler as RegisteredHandler;
    const unsubscribe = this.emitter.on(type, ({ data }) =>
      registeredHandler(data.payload, data.metadata),
    );

    let byHandler = this.subscriptions.get(type);
    if (!byHandler) {
      byHandler = new Map();
      this.subscriptions.set(type, byHandler);
    }
    const registrations = byHandler.get(registeredHandler) ?? [];
    registrations.push(unsubscribe);
    byHandler.set(registeredHandler, registrations);

    return this;
  }

  /**
   * 移除事件监听器。
   *
   * 传入 handler 时移除该 handler 最近一次注册；未传 handler 时移除该事件的全部监听器。
   */
  off<K extends keyof TEvents>(eventType: K, handler?: RuntimeEventHandler<TEvents[K]>): this {
    const type = eventType as string;
    if (this.debugEnabled) logger.debug(`🔇 Off: ${type}`);

    const byHandler = this.subscriptions.get(type);
    if (!byHandler) return this;

    if (!handler) {
      for (const registrations of byHandler.values()) {
        for (const unsubscribe of registrations) unsubscribe();
      }
      this.subscriptions.delete(type);
      return this;
    }

    const registeredHandler = handler as RegisteredHandler;
    const registrations = byHandler.get(registeredHandler);
    const unsubscribe = registrations?.pop();
    unsubscribe?.();

    if (!registrations || registrations.length === 0) {
      byHandler.delete(registeredHandler);
    }
    if (byHandler.size === 0) {
      this.subscriptions.delete(type);
    }

    return this;
  }

  /** 销毁实例，清空所有监听器。 */
  destroy(): void {
    if (this.debugEnabled) logger.debug('💥 Destroying EventBus');
    this.emitter.clearListeners();
    this.subscriptions.clear();
  }

  /** 获取诊断信息。listenersCount 保持历史语义：有监听器的 event type 数量。 */
  getStats() {
    return {
      listenersCount: this.subscriptions.size,
    };
  }

  setDebugMode(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  private getAggregateErrors(error: unknown): unknown[] | undefined {
    return error instanceof Error &&
      'errors' in error &&
      Array.isArray((error as Error & { errors?: unknown[] }).errors)
      ? (error as Error & { errors: unknown[] }).errors
      : undefined;
  }

  private logDeliveryFailure(type: string, error: unknown): void {
    const aggregateErrors = this.getAggregateErrors(error);

    if (aggregateErrors) {
      for (const cause of aggregateErrors) {
        logger.error(`❌ Event handler failed: ${type}`, cause);
      }
      return;
    }
    logger.error(`❌ Event handler failed: ${type}`, error);
  }
}
