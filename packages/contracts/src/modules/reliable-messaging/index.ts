// ==========================================
// Reliable Messaging (W0 / R1)
// 通用 OutboxMessage / InboxReceipt / ProjectionCursor / BusinessOperationReceipt / Lease / Fail-Fast Capability / Application Ports
// ==========================================

import type { CausationId, CorrelationId, MessageId } from '../../primitives/command';

// ============ W0-1: 统一业务操作、交付、租约、能力与 Application Port 契约 ============
export * from './operation-receipt';
export * from './lease';
export * from './projection';
export * from './capability';
export * from './ports';

// ============ R1-1: 传统/通用 Outbox / Inbox / ProjectionCursor 类型 ============

/**
 * Outbox 消息状态机（R1-1 Legacy 4 状态）。
 *
 * 与 W0-1 8 状态 BusinessOperationStatus 的映射边界 (P2-3)：
 * - pending    -> pending (等待 Outbox 调度)
 * - dispatched -> succeeded (投递成功终态)
 * - failed     -> retryable (暂态失败可重试) / failed (终态失败)
 * - dead       -> dead_letter (死信队列等待运维 replay)
 */
export type OutboxMessageStatus = 'pending' | 'dispatched' | 'failed' | 'dead';

/**
 * 映射 R1 遗留 OutboxMessageStatus 到 W0 8 状态 BusinessOperationStatus (P2-3)
 */
export function mapOutboxStatusToBusinessOperationStatus(
  status: OutboxMessageStatus,
): import('./operation-receipt').BusinessOperationStatus {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'dispatched':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'dead':
      return 'dead_letter';
  }
}

/** Inbox 回执状态：同一 messageId 只允许一次成功处理（幂等）。 */
export type InboxReceiptOutcome = 'ok' | 'failed';

/** 投递模式：低延迟内存总线（进程内）或 durable outbox（跨进程/崩溃恢复）。 */
export type DeliveryMode = 'event-bus' | 'outbox';

/** 事件/消息 schema 版本（R1-5）：载荷演进必须显式升版。 */
export type MessageSchemaVersion = 1 | 2 | 3 | 4 | 5;

export interface OutboxMessage {
  /** 消息唯一 id（幂等键）。 */
  id: MessageId;
  /** 操作主体；系统消息为 null。 */
  identityId: string | null;
  /** 消息类型（如 'task.instance.completed'）。 */
  messageType: string;
  /** 载荷 schema 版本。 */
  schemaVersion: MessageSchemaVersion;
  /** 业务因果链根 id。 */
  correlationId: CorrelationId;
  /** 触发本消息的上游 id；根消息为 null。 */
  causationId: CausationId | null;
  /** 载荷（JSON 序列化）。 */
  payloadJson: string;
  /** 当前状态。 */
  status: OutboxMessageStatus;
  /** 已尝试投递次数。 */
  attempts: number;
  /** 可投递时间（退避后）。 */
  availableAt: string;
  /** 最近一次投递错误。 */
  lastError: string | null;
  /** 成功投递时间。 */
  dispatchedAt: string | null;
  /** 入队时间。 */
  createdAt: string;
}

export interface InboxReceipt {
  /** 与源消息同 id → 天然幂等：同一消息重复消费只更新回执。 */
  id: MessageId;
  /** 消费者名（如 'task-projection'、'goal-contribution'）。 */
  consumer: string;
  /** 处理结果。 */
  outcome: InboxReceiptOutcome;
  /** 失败原因；成功为 null。 */
  error: string | null;
  /** 处理时间。 */
  processedAt: string;
}

export interface ProjectionCursor {
  /** 投影名（如 'task-projection'）。 */
  projector: string;
  /** 源标识（如 'task.instance'）。 */
  sourceName: string;
  /** 已处理到的源行 id（reconcile/增量重放的游标）。 */
  lastProcessedId: string | null;
  /** 最近处理时间。 */
  lastProcessedAt: string | null;
  /** 游标版本（每次推进 +1）。 */
  version: number;
  /** 更新时间。 */
  updatedAt: string;
}

/** 消息重试策略（R1-5）。 */
export interface MessageRetryPolicy {
  /** 最大尝试次数；超过后进入 dead。 */
  maxAttempts: number;
  /** 初始退避毫秒。 */
  backoffBaseMs: number;
  /** 退避倍数。 */
  backoffMultiplier: number;
}
