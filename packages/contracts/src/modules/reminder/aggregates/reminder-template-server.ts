/**
 * Reminder Template Aggregate Root - Server Interface
 * 提醒模板聚合根 - 服务端接口
 */

import type { ReminderTemplateId, IdentityId } from '../../../primitives';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import type { ReminderHistoryServerDTO } from '../entities/reminder-history-server';

// 从值对象导入类型
import type {
  ReminderType,
  ReminderStatus,
  NotificationConfigDTO,
  TriggerConfigDTO,
  ActiveTimeConfigDTO,
  ActiveHoursConfigDTO,
} from '../value-objects';

// ============ DTO 定义 ============

/**
 * Reminder Template Server DTO
 */
export interface ReminderTemplateServerDTO {
  id: ReminderTemplateId;
  identityId: IdentityId;
  name: string;
  description?: string | null;
  type: ReminderType;
  trigger: TriggerConfigDTO;
  activeTime: ActiveTimeConfigDTO;
  activeHours?: ActiveHoursConfigDTO | null;
  notificationConfig: NotificationConfigDTO;
  selfEnabled: boolean;
  status: ReminderStatus;
  importanceLevel: ImportanceLevel;
  tags: string[];
  color?: string | null;
  icon?: string | null;
  nextTriggerAt?: number | null; // epoch ms
  version: number;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  deletedAt?: number | null; // epoch ms

  // ===== 子实体 DTO =====
  history?: ReminderHistoryServerDTO[] | null; // 提醒历史列表（可选加载）
}

