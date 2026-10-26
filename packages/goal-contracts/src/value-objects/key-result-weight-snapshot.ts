/**
 * Key Result Weight Snapshot Value Object Contracts
 * 关键成果权重快照值对象契约
 *
 * 用于记录 KeyResult 权重的历史变更，支持权重调整的完整追溯和审计。
 * 注意：Contracts 包只包含纯类型定义，不包含业务逻辑或方法
 */

import type { Instant, TransferDate, IdentityId } from '@memoflow/shared-primitives';
import type { GoalId } from './goal-id';
import type { KeyResultId } from './key-result-id';
import type { KeyResultWeightSnapshotId } from './key-result-weight-snapshot-id';

// ============ 枚举定义 ============

/**
 * 权重快照触发方式
 */
export const SnapshotTrigger = {
  Manual: 'Manual', // 用户手动调整
  Auto: 'Auto', // 系统自动调整
  Restore: 'Restore', // 恢复历史快照
  Import: 'Import', // 从外部导入
} as const;

export type SnapshotTrigger = (typeof SnapshotTrigger)[keyof typeof SnapshotTrigger];

// ============ Domain Shape (领域层) ============

/**
 * 关键成果权重快照 - Domain Shape
 * 给 domain-shared 中的 Class 实现用
 */
export interface KeyResultWeightSnapshot {
  id: KeyResultWeightSnapshotId;
  goalId: GoalId;
  keyResultId: KeyResultId;
  identityId: IdentityId;
  oldWeight: number;
  newWeight: number;
  weightDelta: number;
  /** ADR-037: Instant epoch ms */
  snapshotTime: Instant;
  trigger: SnapshotTrigger;
  reason: string | null;
  operatorId: IdentityId;
  createdAt: Instant;
}

// ============ Transfer DTO (传输层) ============

/**
 * Key Result Weight Snapshot DTO
 * API 传输用
 */
export interface KeyResultWeightSnapshotDTO {
  id: KeyResultWeightSnapshotId;
  goalId: GoalId;
  keyResultId: KeyResultId;
  identityId: IdentityId;
  oldWeight: number;
  newWeight: number;
  weightDelta: number;
  snapshotTime: TransferDate;
  trigger: SnapshotTrigger;
  reason: string | null;
  operatorId: IdentityId;
  createdAt: TransferDate;
}
