/**
 * Reminder Client Service
 *
 * Constructor-injected application service for reminder management.
 * Uses port interfaces directly, returning Result<T> types throughout.
 *
 * @module application-client/reminder-client-service
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
import type { IReminderApiClient } from './ports/reminder-api-client.port';

export class ReminderClientService implements IReminderApiClient {
  constructor(private readonly reminderApi: IReminderApiClient) {
    this.createReminderTemplate = this.createReminderTemplate.bind(this);
    this.getReminderTemplate = this.getReminderTemplate.bind(this);
    this.getReminderTemplates = this.getReminderTemplates.bind(this);
    this.updateReminderTemplate = this.updateReminderTemplate.bind(this);
    this.deleteReminderTemplate = this.deleteReminderTemplate.bind(this);
    this.toggleTemplateEnabled = this.toggleTemplateEnabled.bind(this);
    this.replaceTemplateProfiles = this.replaceTemplateProfiles.bind(this);
    this.getUpcomingReminders = this.getUpcomingReminders.bind(this);
    this.getTodaySchedule = this.getTodaySchedule.bind(this);
    this.createReminderGroup = this.createReminderGroup.bind(this);
    this.getReminderGroup = this.getReminderGroup.bind(this);
    this.getReminderGroups = this.getReminderGroups.bind(this);
    this.updateReminderGroup = this.updateReminderGroup.bind(this);
    this.deleteReminderGroup = this.deleteReminderGroup.bind(this);
    this.toggleReminderGroupStatus = this.toggleReminderGroupStatus.bind(this);
    this.getPreferences = this.getPreferences.bind(this);
    this.updatePreferences = this.updatePreferences.bind(this);
  }

  // ===== 模板 CRUD =====

  async createReminderTemplate(
    request: CreateReminderTemplateReq,
  ): Promise<Result<ReminderTemplateClientDTO>> {
    return this.reminderApi.createReminderTemplate(request);
  }

  async getReminderTemplate(id: string): Promise<Result<ReminderTemplateClientDTO>> {
    return this.reminderApi.getReminderTemplate(id);
  }

  async getReminderTemplates(): Promise<Result<ReminderTemplateListRes>> {
    return this.reminderApi.getReminderTemplates();
  }

  async updateReminderTemplate(
    id: string,
    request: UpdateReminderTemplateReq,
  ): Promise<Result<ReminderTemplateClientDTO>> {
    return this.reminderApi.updateReminderTemplate(id, request);
  }

  async deleteReminderTemplate(id: string): Promise<Result<void>> {
    return this.reminderApi.deleteReminderTemplate(id);
  }

  async toggleTemplateEnabled(id: string): Promise<Result<ReminderTemplateClientDTO>> {
    return this.reminderApi.toggleTemplateEnabled(id);
  }

  async replaceTemplateProfiles(
    templateId: string,
    profileIds: readonly string[],
  ): Promise<Result<ReminderTemplateClientDTO>> {
    return this.reminderApi.replaceTemplateProfiles(templateId, profileIds);
  }

  async getUpcomingReminders(params?: {
    days?: number;
    limit?: number;
    importanceLevel?: string;
    type?: string;
    timezone?: string;
  }): Promise<Result<GetUpcomingRemindersRes>> {
    return this.reminderApi.getUpcomingReminders(params);
  }

  async getTodaySchedule(params?: {
    limit?: number;
    includeExpired?: boolean;
    timezone?: string;
  }): Promise<Result<GetReminderTodayScheduleRes>> {
    return this.reminderApi.getTodaySchedule(params);
  }

  // ===== 分组 CRUD =====

  async createReminderGroup(
    request: CreateReminderGroupReq,
  ): Promise<Result<ReminderGroupClientDTO>> {
    return this.reminderApi.createReminderGroup(request);
  }

  async getReminderGroup(id: string): Promise<Result<ReminderGroupClientDTO>> {
    return this.reminderApi.getReminderGroup(id);
  }

  async getReminderGroups(): Promise<Result<ReminderGroupListRes>> {
    return this.reminderApi.getReminderGroups();
  }

  async updateReminderGroup(
    id: string,
    request: UpdateReminderGroupReq,
  ): Promise<Result<ReminderGroupClientDTO>> {
    return this.reminderApi.updateReminderGroup(id, request);
  }

  async deleteReminderGroup(id: string): Promise<Result<void>> {
    return this.reminderApi.deleteReminderGroup(id);
  }

  async toggleReminderGroupStatus(id: string): Promise<Result<ReminderGroupClientDTO>> {
    return this.reminderApi.toggleReminderGroupStatus(id);
  }

  async getPreferences(): Promise<Result<UserReminderPreferencesClientDTO>> {
    return this.reminderApi.getPreferences();
  }

  async updatePreferences(
    data: Record<string, unknown>,
  ): Promise<Result<UserReminderPreferencesClientDTO>> {
    return this.reminderApi.updatePreferences(data);
  }
}

// ===== Factory =====

export function createReminderClientService(
  reminderApi: IReminderApiClient,
): ReminderClientService {
  return new ReminderClientService(reminderApi);
}
