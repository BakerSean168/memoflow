// Event patterns - base event handler and dispatcher
// Residual 1031: sole createEventBusAdapter + event interfaces (goal dual re-exports).

import type { IDomainEvent } from '@memoflow/shared-primitives';

/**
 * Event handler type
 */
export type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

/**
 * Event emitter interface
 */
export interface IEventEmitter {
  on(eventName: string, handler: EventHandler): void;
  once(eventName: string, handler: EventHandler): void;
  off(eventName: string, handler: EventHandler): void;
  emit(eventName: string, data?: unknown): Promise<void>;
  removeAllListeners(eventName?: string): void;
}

/**
 * 重新导出已有的领域事件接口
 * 统一使用 @memoflow/contracts/shared 中的 IDomainEvent
 */
export type { IDomainEvent };

/**
 * EventBus 接口 - 用于发布领域事件
 *
 * 职责：
 * - 发布领域事件到事件总线
 * - 支持同步和异步处理
 *
 * 【设计说明】
 * 使用项目已有的 IDomainEvent 接口 (来自 @memoflow/contracts/shared)
 * 字段包括：eventType, payload, aggregateId, occurredAt
 */
export interface IEventBus {
  /**
   * 发布领域事件
   * @param event 领域事件对象（使用 IDomainEvent 接口）
   */
  publish<T extends IDomainEvent>(event: T): Promise<void>;

  /**
   * 发送事件（可选的简化 API）
   * @param eventType 事件类型
   * @param payload 事件负载
   */
  send?(eventType: string, payload: unknown): Promise<void>;
}

// ============ Mapper 接口 ============

/**
 * 持久化 Mapper 接口
 *
 * 定义领域实体与数据库模型之间的双向映射规范。
 * 每个数据源（Prisma、SQLite）应提供自己的 Mapper 实现。
 *
 * @typeParam TDomain - 领域聚合根/实体类型
 * @typeParam TRecord - 数据库记录类型（Prisma model / SQLite row）
 * @typeParam TPersistence - 持久化写入数据类型（不含 id, createdAt 等自动字段）
 */
export interface IPersistenceMapper<TDomain, TRecord, TPersistence = Record<string, unknown>> {
  /** 数据库记录 → 领域实体 */
  toDomain(record: TRecord): TDomain;

  /** 领域实体 → 数据库写入数据 */
  toPersistence(entity: TDomain): TPersistence;
}

// ============ EventBus 适配器工厂 ============

/**
 * 可发送事件的最小接口
 *
 * 与 GlobalEventBus.send() 匹配，但不依赖具体实现
 */
import type { EventDeliveryMetadata } from '@memoflow/utils/domain';

export type { EventDeliveryMetadata };

export interface IEventSender {
  /** 通知式 fire-and-forget 发布。 */
  send(eventType: string, payload: unknown, metadata?: EventDeliveryMetadata): void;
  /** 等待本次 delivery 的全部 handler 完成；用于可靠发布边界。 */
  dispatch(eventType: string, payload: unknown, metadata?: EventDeliveryMetadata): Promise<void>;
}

/**
 * Residual 1031: sole IEventBus adapter factory.
 * 创建 IEventBus 适配器
 *
 * 将应用层的事件总线（如 GlobalEventBus）适配为 IEventBus 接口，
 * 供 AggregateRepositoryBase 使用。
 *
 * 消除各仓储中重复定义 eventBusAdapter 的问题。
 *
 * @param sender - 实现 send(eventType, payload) 的事件发送器
 * @returns IEventBus 适配器实例
 *
 * @example
 * ```typescript
 * import { eventBus } from '@memoflow/utils/domain';
 * import { createEventBusAdapter } from '@memoflow/patterns';
 *
 * const eventBusAdapter = createEventBusAdapter(eventBus);
 * // 在仓储构造函数中使用：super(eventBusAdapter)
 * ```
 */
export function createEventBusAdapter(sender: IEventSender): IEventBus {
  return {
    async publish(event) {
      await sender.dispatch(event.eventType, event.payload, {
        aggregateId: event.aggregateId,
        occurredAt: event.occurredAt,
        idempotencyKey: event.idempotencyKey,
      });
    },
    async send(eventType, payload) {
      await sender.dispatch(eventType, payload);
    },
  };
}
