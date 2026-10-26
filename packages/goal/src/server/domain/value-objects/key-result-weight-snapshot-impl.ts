/**
 * KR 权重快照值对象
 *
 * 不可变对象，用于记录某个时间点的 KR 权重变更。
 * 包含权重变化的完整上下文信息（谁、什么时候、为什么、怎么变的）。
 */

import type { KeyResultWeightSnapshotDTO, SnapshotTrigger } from '@memoflow/goal-contracts';
import { InvalidWeightError } from './weight-errors';

// 类型别名

export class KeyResultWeightSnapshot {
  constructor(
    public readonly id: string,
    public readonly goalId: string,
    public readonly keyResultId: string,
    public readonly identityId: string,
    public readonly oldWeight: number,
    public readonly newWeight: number,
    public readonly snapshotTime: number,
    public readonly trigger: SnapshotTrigger,
    public readonly operatorId: string,
    public readonly reason?: string,
    public readonly createdAt?: number,
  ) {
    this.validateWeights();
  }

  /**
   * 计算权重变化量
   * @returns 权重增量（可为负数）
   */
  get weightDelta(): number {
    return this.newWeight - this.oldWeight;
  }

  /**
   * 验证权重值范围
   * @throws {InvalidWeightError} 如果权重不在 0-100 范围内
   */
  private validateWeights(): void {
    if (this.oldWeight < 0 || this.oldWeight > 100) {
      throw new InvalidWeightError('oldWeight', this.oldWeight);
    }
    if (this.newWeight < 0 || this.newWeight > 100) {
      throw new InvalidWeightError('newWeight', this.newWeight);
    }
  }

  /**
   * 转换为 DTO
   */
  public toDTO(): KeyResultWeightSnapshotDTO {
    return {
      id: this.id as KeyResultWeightSnapshotDTO['id'],
      goalId: this.goalId as KeyResultWeightSnapshotDTO['goalId'],
      keyResultId: this.keyResultId as KeyResultWeightSnapshotDTO['keyResultId'],
      identityId: this.identityId as KeyResultWeightSnapshotDTO['identityId'],
      oldWeight: this.oldWeight,
      newWeight: this.newWeight,
      weightDelta: this.weightDelta,
      snapshotTime: this.snapshotTime,
      trigger: this.trigger,
      reason: this.reason ?? null,
      operatorId: this.operatorId as KeyResultWeightSnapshotDTO['operatorId'],
      createdAt: this.createdAt ?? Date.now(),
    };
  }

  /**
   * 从 DTO 创建实例
   */
  public static fromDTO(dto: KeyResultWeightSnapshotDTO): KeyResultWeightSnapshot {
    return new KeyResultWeightSnapshot(
      dto.id,
      dto.goalId,
      dto.keyResultId,
      dto.identityId,
      dto.oldWeight,
      dto.newWeight,
      dto.snapshotTime,
      dto.trigger,
      dto.operatorId,
      dto.reason ?? undefined,
      dto.createdAt,
    );
  }
}
