/**
 * Reminder Group Aggregate Root - Server Interface
 * 提醒分组聚合根 - 服务端接口
 */

import type { ReminderStatus, GroupStatsDTO } from '../value-objects';
import type { TransferDate, ReminderGroupId, IdentityId } from '../../../primitives';

export interface ReminderGroupServerDTO {
  // 基础属性
  id: ReminderGroupId;
  identityId: IdentityId;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  enabled: boolean;
  status: ReminderStatus;
  order: number;
  stats: GroupStatsDTO;

  version: number;
  createdAt: TransferDate;
  updatedAt: TransferDate;
  deletedAt?: TransferDate | null;
}

