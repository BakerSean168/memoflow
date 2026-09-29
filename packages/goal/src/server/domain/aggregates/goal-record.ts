/**
 * GoalRecord 受 Goal 聚合管理的记录实体
 *
 * 【规范说明：聚合根（Aggregate Root）】
 * 聚合根是 DDD 中的核心概念，代表一个业务边界：
 * - 唯一标识：通过 ID 区分不同的聚合实例
 * - 事务边界：所有对聚合的修改在一个事务内完成
 * - 统一性：聚合保证内部状态的一致性
 * - 生命周期：聚合有创建、修改、删除的完整生命周期
 *
 * 【GoalRecord 职责】
 * - 记录关键成果的具体数值变更
 * - 追踪变更时间和备注原因
 * - 支持进度追踪（结合其他记录计算进度）
 *
 * 并发和删除由 Goal 聚合根统一管理；记录仅保留审计时间。
 *
 * 【不变量（Invariants）】
 * 这些条件必须始终保持真：
 * - value 是有效数字
 * - recordedAt 不能早于 createdAt（理论上）
 * - keyResultId 必须存在
 */

import { Entity } from '@memoflow/utils/domain';
import { GoalRecordId, KeyResultId } from '../../domain';
import type {
  GoalRecordServerDTO,
  GoalRecordSource,
  GoalRecordSourceTypeValue,
} from '@memoflow/contracts/goal';
import type { IdentityId, Instant } from '@memoflow/contracts/primitives';

// 内部状态接口
export interface GoalRecordState {
  id: GoalRecordId;
  keyResultId: KeyResultId;
  identityId: IdentityId;
  value: number;
  note: string | null;
  sourceType?: GoalRecordSourceTypeValue | null;
  sourceId?: string | null;
  recordedAt: Instant;
  createdAt: Instant;
  updatedAt: Instant;
}

/**
 * GoalRecord 聚合根
 */
export class GoalRecord extends Entity<GoalRecordId> {
  // ================= 1. 内部状态 (Props) =================
  private _props: GoalRecordState;

  // ================= 2. 构造函数 (Private) =================
  private constructor(state: GoalRecordState) {
    super(state.id);
    this._props = {
      id: state.id,
      keyResultId: state.keyResultId,
      identityId: state.identityId,
      value: state.value,
      note: state.note ?? null,
      sourceType: state.sourceType ?? null,
      sourceId: state.sourceId ?? null,
      recordedAt: state.recordedAt,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
  }

  // ================= 3. 公共属性 (Getters) =================
  get keyResultId(): KeyResultId {
    return this._props.keyResultId;
  }

  get identityId(): IdentityId {
    return this._props.identityId;
  }

  get value(): number {
    return this._props.value;
  }

  get note(): string | null {
    return this._props.note;
  }

  get sourceType(): GoalRecordSourceTypeValue | null {
    return this._props.sourceType ?? null;
  }

  get sourceId(): string | null {
    return this._props.sourceId ?? null;
  }

  get recordedAt(): Instant {
    const v = this._props.recordedAt;
    return v as Instant;
  }

  get createdAt(): Instant {
    const v = this._props.createdAt;
    return v as Instant;
  }

  get updatedAt(): Instant {
    const v = this._props.updatedAt;
    return v as Instant;
  }

  // ================= 4. 工厂方法 (Factories) =================

  /**
   * 🏭 业务工厂：创建新的目标记录
   * @param params.id 可选，支持前端生成 ID
   */
  public static create(params: {
    id?: GoalRecordId;
    keyResultId: KeyResultId;
    identityId: IdentityId;
    value: number;
    note?: string;
    source?: GoalRecordSource;
    recordedAt?: Instant;
  }): GoalRecord {
    // 验证
    if (!params.keyResultId) {
      throw new Error('KeyResult ID is required');
    }
    if (!Number.isFinite(params.value)) {
      throw new Error('Value must be a finite number');
    }
    if (params.source && (!params.source.type || !params.source.id.trim())) {
      throw new Error('Goal record source type and ID are required together');
    }

    const now = Date.now();
    const id = params.id ?? GoalRecordId.generate();

    return new GoalRecord({
      id,
      keyResultId: params.keyResultId,
      identityId: params.identityId,
      value: params.value,
      note: params.note?.trim() || null,
      sourceType: params.source?.type ?? null,
      sourceId: params.source?.id.trim() ?? null,
      recordedAt: params.recordedAt != null ? Number(params.recordedAt) : now,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * 🏭 恢复工厂：从状态恢复
   */
  public static load(state: GoalRecordState): GoalRecord {
    return new GoalRecord(state);
  }

  // ================= 5. 业务行为 (Business Actions) =================

  /**
   * ✅ 更新备注
   */
  public updateValue(value: number): void {
    if (!Number.isFinite(value)) throw new Error('Value must be a finite number');
    this._props.value = value;
    this._props.updatedAt = Date.now();
  }

  public updateNote(note?: string | null): void {
    this._props.note = note?.trim() || null;
    this._props.updatedAt = Date.now();
  }

  // ================= 6. 序列化 (Serialization) =================

  /**
   * 转换为 Server DTO
   */
  public toServerDTO(): GoalRecordServerDTO {
    return {
      id: this.id,
      keyResultId: this._props.keyResultId,
      identityId: this._props.identityId,
      value: this._props.value,
      note: this._props.note,
      sourceType: this._props.sourceType ?? null,
      sourceId: this._props.sourceId ?? null,
      recordedAt: this._props.recordedAt,
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
    };
  }

  /**
   * 转换为 Client DTO
   */
  public toClientDTO(
    goalId: string,
    valueAfter: number = this._props.value,
  ): import('@memoflow/contracts/goal').GoalRecordClientDTO {
    return {
      id: this.id,
      keyResultId: this._props.keyResultId,
      goalId: goalId as import('@memoflow/contracts/goal').GoalRecordClientDTO['goalId'],
      value: this._props.value,
      valueAfter,
      comment: this._props.note,
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
    };
  }
}
