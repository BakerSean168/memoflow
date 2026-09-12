/**
 * KeyResult Entity - Server Interface
 *
 * 并发版本和删除生命周期由 Goal 聚合根统一管理。
 */

import type { GoalTimeframe, KeyResultMeasurement } from '../value-objects';
import type { TransferDate, KeyResultId } from '../../../primitives';

export interface KeyResultServerDTO {
  id: KeyResultId;
  title: string;
  description: string | null;
  progress: KeyResultMeasurement;
  target: GoalTimeframe | null;
  weight: number; // 权重 (1-5)
  sortOrder: number; // 排序位置
  createdAt: TransferDate;
  updatedAt: TransferDate;
}
