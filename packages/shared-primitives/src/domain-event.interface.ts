// 这是一个泛型接口，用于描述存储在聚合根里的事件结构
export interface IDomainEvent<P = unknown> {
  // 对应 AppEventRegistry 里的 Key (如 'account:closed')
  eventType: string;

  // 对应 AppEventRegistry 里的 Value
  payload: P;

  // 元数据
  aggregateId: string;
  occurredAt: Date;

  /**
   * 幂等键（at-least-once 语义下随事件 envelope 传递）。
   * 消费者若产生副作用，必须用该键在 durable receipt/inbox 中原子去重，
   * 不能假定只投递一次。
   */
  idempotencyKey?: string;
}
