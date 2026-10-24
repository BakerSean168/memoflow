import { Entity } from './entity';
import type { IDomainEvent } from '@memoflow/contracts/shared';
import type { Equatable } from '@memoflow/contracts/shared';

export abstract class AggregateRoot<TId extends string | number | Equatable> extends Entity<TId> {
  private _domainEvents: IDomainEvent[] = [];
  get domainEvents(): ReadonlyArray<IDomainEvent> {
    return [...this._domainEvents];
  }

  /**
   * ✅ 优化点 2：自动封装元数据
   * 接收 type 和 payload，自动生成 aggregateId 和 occurredAt
   * * ✅ 优化点 3：支持泛型 P
   * 这解决了你之前 "Expected 0 type arguments" 的报错
   */
  protected addDomainEvent<P>(eventType: string, payload: P): void {
    const event: IDomainEvent<P> = {
      eventType,
      payload,
      // 自动处理 ID 转字符串 (假设你的 ID 有 toString 方法或本身就是 string)
      aggregateId: this.getIdAsString(),
      occurredAt: new Date(),
    };

    this._domainEvents.push(event);
  }

  public clearDomainEvents(): void {
    this._domainEvents = [];
  }

  public pullDomainEvents(): IDomainEvent[] {
    const events = [...this._domainEvents];
    this.clearDomainEvents();
    return events;
  }

  /**
   * 辅助方法：确保 ID 能转为字符串用于事件记录
   */
  private getIdAsString(): string {
    if (typeof this.id === 'string') return this.id;
    if (typeof this.id === 'number') return this.id.toString();
    // 如果是值对象，调用 toString()
    return String(this.id);
  }
}
