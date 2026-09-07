/**
 * Reminder IPC Adapter
 *
 * IPC implementation of IReminderApiClient for Electron desktop apps.
 */

import type { Result } from '@memoflow/contracts/result';
import { ReminderChannels } from '@memoflow/contracts/electron';
import type { IResultIpcClient, IReminderApiClient } from '../types';
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

export class ReminderIpcAdapter implements IReminderApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  // ===== 模板 CRUD =====

  async createReminderTemplate(
    request: CreateReminderTemplateReq,
  ): Promise<Result<ReminderTemplateClientDTO>> {
    return this.ipcClient.invoke(ReminderChannels.TEMPLATE_CREATE, request);
  }

  async getReminderTemplate(id: string): Promise<Result<ReminderTemplateClientDTO>> {
    return this.ipcClient.invoke(ReminderChannels.TEMPLATE_GET, id);
  }

  /**
   * Lists reminder templates.
   * Note: The desktop handler resolves identity from auth context and does not
   * support pagination yet — params are forwarded but may be ignored server-side.
   */
  async getReminderTemplates(): Promise<Result<ReminderTemplateListRes>> {
    return this.ipcClient.invoke(ReminderChannels.TEMPLATE_LIST);
  }

  /**
   * Lists templates for the authenticated user.
   * Desktop handler resolves identity from auth context; identityId arg is
   * kept for HTTP adapter parity but unused by the IPC handler.
   */
  async getUserTemplates(): Promise<Result<ReminderTemplateClientDTO[]>> {
    return this.ipcClient.invoke(ReminderChannels.TEMPLATE_GET_BY_USER);
  }

  async updateReminderTemplate(
    id: string,
    request: UpdateReminderTemplateReq,
  ): Promise<Result<ReminderTemplateClientDTO>> {
    return this.ipcClient.invoke(ReminderChannels.TEMPLATE_UPDATE, id, request);
  }

  async deleteReminderTemplate(id: string): Promise<Result<void>> {
    return this.ipcClient.invoke(ReminderChannels.TEMPLATE_DELETE, id);
  }

  async toggleTemplateEnabled(id: string): Promise<Result<ReminderTemplateClientDTO>> {
    return this.ipcClient.invoke(ReminderChannels.TEMPLATE_TOGGLE_ENABLED, id);
  }

  async moveTemplateToGroup(
    templateId: string,
    targetGroupId: string | null,
  ): Promise<Result<ReminderTemplateClientDTO>> {
    return this.ipcClient.invoke(ReminderChannels.TEMPLATE_MOVE_TO_GROUP, templateId, {
      groupId: targetGroupId,
    });
  }

  async getUpcomingReminders(params?: {
    days?: number;
    limit?: number;
    importanceLevel?: string;
    type?: string;
    timezone?: string;
  }): Promise<Result<GetUpcomingRemindersRes>> {
    return this.ipcClient.invoke(ReminderChannels.UPCOMING_GET, params);
  }

  async getTodaySchedule(params?: {
    limit?: number;
    includeExpired?: boolean;
    timezone?: string;
  }): Promise<Result<GetReminderTodayScheduleRes>> {
    return this.ipcClient.invoke(ReminderChannels.TODAY_SCHEDULE_GET, params);
  }

  // ===== 分组 CRUD =====

  async createReminderGroup(
    request: CreateReminderGroupReq,
  ): Promise<Result<ReminderGroupClientDTO>> {
    return this.ipcClient.invoke(ReminderChannels.GROUP_CREATE, request);
  }

  async getReminderGroup(id: string): Promise<Result<ReminderGroupClientDTO>> {
    return this.ipcClient.invoke(ReminderChannels.GROUP_GET, id);
  }

  /**
   * Lists reminder groups.
   * Desktop handler resolves identity from auth context and does not support
   * pagination yet.
   */
  async getReminderGroups(): Promise<Result<ReminderGroupListRes>> {
    return this.ipcClient.invoke(ReminderChannels.GROUP_LIST);
  }

  /**
   * Lists groups for the authenticated user.
   * Desktop handler resolves identity from auth context.
   */
  async getUserReminderGroups(): Promise<Result<ReminderGroupClientDTO[]>> {
    return this.ipcClient.invoke(ReminderChannels.GROUP_GET_BY_USER);
  }

  async updateReminderGroup(
    id: string,
    request: UpdateReminderGroupReq,
  ): Promise<Result<ReminderGroupClientDTO>> {
    return this.ipcClient.invoke(ReminderChannels.GROUP_UPDATE, id, request);
  }

  async deleteReminderGroup(id: string): Promise<Result<void>> {
    return this.ipcClient.invoke(ReminderChannels.GROUP_DELETE, id);
  }

  async toggleReminderGroupStatus(id: string): Promise<Result<ReminderGroupClientDTO>> {
    return this.ipcClient.invoke(ReminderChannels.GROUP_TOGGLE_STATUS, id);
  }

  async getPreferences(): Promise<Result<UserReminderPreferencesClientDTO>> {
    return this.ipcClient.invoke(ReminderChannels.PREFERENCES_GET);
  }

  async updatePreferences(data: Record<string, unknown>): Promise<Result<UserReminderPreferencesClientDTO>> {
    return this.ipcClient.invoke(ReminderChannels.PREFERENCES_UPDATE, data);
  }
}

export function createReminderIpcAdapter(ipcClient: IResultIpcClient): ReminderIpcAdapter {
  return new ReminderIpcAdapter(ipcClient);
}
