// ==========================================
// Durable Outbox Port (R1-2)
// 跨模块副作用的持久化兜底：事件总线失败时写入 outbox
// ==========================================

import type { CausationId, CorrelationId, MessageId } from '@memoflow/shared-primitives/command';

export interface OutboxEnqueueInput {
  /** 消息类型（通常等于领域事件 eventType）。 */
  messageType: string;
  /** 载荷（JSON 字符串）。 */
  payloadJson: string;
  /** 业务因果链根 id。 */
  correlationId?: CorrelationId | null;
  /** 触发本消息的上游 id。 */
  causationId?: CausationId | null;
  /** 操作主体。 */
  identityId?: string | null;
  /** schema 版本（默认 1）。 */
  schemaVersion?: number;
  /** 预生成消息 id（缺省由仓储生成）。 */
  messageId?: MessageId;
}

/** 持久化 outbox 写入端口：仓储在事件发布失败时调用。 */
export interface IOutboxWriter {
  enqueue(input: OutboxEnqueueInput): Promise<MessageId>;
}
