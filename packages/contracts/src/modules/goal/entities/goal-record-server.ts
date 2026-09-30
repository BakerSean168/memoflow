/**
 * GoalRecord Entity - Server Interface
 * 目标记录实体 - 服务端接口
 *
 * 并发版本和删除生命周期由 Goal 聚合根统一管理。
 */

import { z } from 'zod';

import type {
  TransferDate,
  GoalRecordId,
  KeyResultId,
  IdentityId,
} from '../../../primitives';

export const GoalRecordAuthorship = {
  Manual: 'Manual',
  TaskAutomatic: 'TaskAutomatic',
  TaskUserMeasurement: 'TaskUserMeasurement',
} as const;

export const GoalRecordAuthorshipSchema = z.enum(GoalRecordAuthorship);
export type GoalRecordAuthorship = z.infer<typeof GoalRecordAuthorshipSchema>;

export const GoalRecordSourceType = {
  TaskOccurrence: 'TASK_INSTANCE',
  TaskPlan: 'TASK_TEMPLATE',
} as const;

export type GoalRecordSourceType =
  (typeof GoalRecordSourceType)[keyof typeof GoalRecordSourceType];

export interface GoalRecordSource {
  type: GoalRecordSourceType;
  id: string;
}

// ============ DTO 定义 ============

/**
 * GoalRecord Server DTO
 * 记录本次的独立值，而不是累计值
 */
export interface GoalRecordServerDTO {
  id: GoalRecordId;
  keyResultId: KeyResultId;
  identityId: IdentityId;
  value: number; // 本次记录的值（独立值）
  note: string | null;
  authorship: GoalRecordAuthorship;
  sourceType: GoalRecordSourceType | null;
  sourceId: string | null;
  recordedAt: TransferDate;
  createdAt: TransferDate;
  updatedAt: TransferDate;
}
