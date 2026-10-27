import type { Equatable } from '@memoflow/shared-primitives';

export abstract class Entity<TId extends string | number | Equatable> {
  protected constructor(public readonly id: TId) {
    if (id === null || id === undefined) {
      throw new Error('Entity id cannot be null or undefined');
    }
  }

  public equals(other?: Entity<TId>): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    // 引用相等，肯定是同一个
    if (this === other) {
      return true;
    }

    // 必须是同一个类（防止 User 和 Order ID 撞车）
    if (this.constructor !== other.constructor) {
      return false;
    }

    // 3. 处理 ID 的比对：支持值对象 equals 方法 或 原始类型 ===
    return this.isIdEquals(other.id);
  }
  private isIdEquals(otherId: TId): boolean {
    // 如果 ID 是对象且有 equals 方法 (Value Object)
    if (typeof this.id === 'object' && this.id !== null && 'equals' in this.id) {
      return (this.id as Equatable).equals(otherId);
    }

    // 否则降级为原始类型比较 (string / number)
    return this.id === otherId;
  }
}
