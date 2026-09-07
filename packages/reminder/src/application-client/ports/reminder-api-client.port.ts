/**
 * Reminder API Client Port
 *
 * Transport-agnostic interface for Reminder API operations.
 * Implementations: HTTP adapters (web), IPC adapters (desktop)
 *
 * Types imported from @memoflow/contracts/reminder.
 */

import type { Result } from '@memoflow/contracts/result';
import type {
  ReminderTemplateClientDTO,
  ReminderGroupClientDTO,
  ReminderTemplateListRes,
  ReminderGroupListRes,
  UserReminderPreferencesClientDTO,
  CreateReminderTemplateReq,
  UpdateReminderTemplateReq,
  CreateReminderGroupReq,
  UpdateReminderGroupReq,
  GetUpcomingRemindersRes,
  GetReminderTodayScheduleRes,
} from '@memoflow/contracts/reminder';

/**
 * IReminderApiClient
 *
 * 提醒模块 API 客户端接口
 *
 * Designed to match the actual handler capabilities of the IPC transport.
 * The desktop handler resolves identity from auth context and does not
 * support server-side pagination yet — list operations return flat arrays.
 */
export interface IReminderApiClient {
  // ===== 模板 CRUD =====
  createReminderTemplate(
    request: CreateReminderTemplateReq,
  ): Promise<Result<ReminderTemplateClientDTO>>;
  getReminderTemplate(id: string): Promise<Result<ReminderTemplateClientDTO>>;
  getReminderTemplates(): Promise<Result<ReminderTemplateListRes>>;
  updateReminderTemplate(
    id: string,
    request: UpdateReminderTemplateReq,
  ): Promise<Result<ReminderTemplateClientDTO>>;
  deleteReminderTemplate(id: string): Promise<Result<void>>;
  toggleTemplateEnabled(id: string): Promise<Result<ReminderTemplateClientDTO>>;
  replaceTemplateProfiles(
    templateId: string,
    profileIds: readonly string[],
  ): Promise<Result<ReminderTemplateClientDTO>>;
  getUpcomingReminders(params?: {
    days?: number;
    limit?: number;
    importanceLevel?: string;
    type?: string;
    timezone?: string;
  }): Promise<Result<GetUpcomingRemindersRes>>;
  getTodaySchedule(params?: {
    limit?: number;
    includeExpired?: boolean;
    timezone?: string;
  }): Promise<Result<GetReminderTodayScheduleRes>>;

  // ===== 分组 CRUD =====
  createReminderGroup(request: CreateReminderGroupReq): Promise<Result<ReminderGroupClientDTO>>;
  getReminderGroup(id: string): Promise<Result<ReminderGroupClientDTO>>;
  getReminderGroups(): Promise<Result<ReminderGroupListRes>>;
  updateReminderGroup(
    id: string,
    request: UpdateReminderGroupReq,
  ): Promise<Result<ReminderGroupClientDTO>>;
  deleteReminderGroup(id: string): Promise<Result<void>>;
  toggleReminderGroupStatus(id: string): Promise<Result<ReminderGroupClientDTO>>;
  getPreferences(): Promise<Result<UserReminderPreferencesClientDTO>>;
  updatePreferences(
    data: Record<string, unknown>,
  ): Promise<Result<UserReminderPreferencesClientDTO>>;
}
