/**
 * Progress Calculation DTOs
 * 进度计算相关 DTO
 *
 * 用于：
 * - API 响应（前端展示变更详情）
 * - 预览功能（用户保存前预览进度变化）
 */

import type { GoalId, KeyResultId } from '../../../primitives';

/**
 * 单个 KeyResult 的计算结果 DTO
 *
 * 用于前端展示变更详情，如：
 * "进度从 50% 变更为 60%"
 */
export interface ProgressCalculationResultDTO {
  /** KeyResult ID */
  keyResultId: KeyResultId;
  /** 旧的当前值 */
  oldValue: number;
  /** 新的当前值 */
  newValue: number;
  /** 是否发生变化 */
  changed: boolean;
  /** 旧的完成百分比 (0-100) */
  oldPercentage: number;
  /** 新的完成百分比 (0-100) */
  newPercentage: number;
}

/**
 * 整个 Goal 的计算结果 DTO
 *
 * 用于批量重新计算后的结果展示
 */
export interface GoalProgressCalculationResultDTO {
  /** Goal ID */
  goalId: GoalId;
  /** 旧的目标进度 (0-100) */
  oldProgress: number;
  /** 新的目标进度 (0-100) */
  newProgress: number;
  /** 是否发生变化 */
  changed: boolean;
  /** 各 KeyResult 的计算结果 */
  keyResultResults: ProgressCalculationResultDTO[];
}

/**
 * 进度预览结果 DTO
 *
 * 用于用户添加记录前预览最终进度
 * 前端可以显示："如果保存，进度将从 50% 变为 60%"
 */
export interface ProgressPreviewDTO {
  /** 当前值 */
  currentValue: number;
  /** 预览值（如果保存后的值） */
  previewValue: number;
  /** 当前完成百分比 (0-100) */
  currentPercentage: number;
  /** 预览完成百分比 (0-100) */
  previewPercentage: number;
}
