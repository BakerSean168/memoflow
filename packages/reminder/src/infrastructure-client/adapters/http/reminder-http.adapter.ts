/**
 * Reminder HTTP Adapter
 *
 * HTTP implementation of IReminderApiClient.
 */

import type { Result } from '@memoflow/contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { IReminderApiClient } from '../types';
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
 * ReminderHttpAdapter
 *
 * HTTP implementation of the Reminder API client.
 */
export class ReminderHttpAdapter implements IReminderApiClient {
  private readonly templatesUrl = '/reminders/templates';
  private readonly groupsUrl = '/reminders/groups';

  constructor(private readonly httpClient: IResultHttpClient) {}

  // ===== Template CRUD =====

  async createReminderTemplate(
    request: CreateReminderTemplateReq,
  ): Promise<Result<ReminderTemplateClientDTO>> {
    return this.httpClient.post(this.templatesUrl, request);
  }

  async getReminderTemplate(id: string): Promise<Result<ReminderTemplateClientDTO>> {
    return this.httpClient.get(`${this.templatesUrl}/${id}`);
  }

  async getReminderTemplates(): Promise<Result<ReminderTemplateListRes>> {
    return this.httpClient.get(this.templatesUrl);
  }

  async updateReminderTemplate(
    id: string,
    request: UpdateReminderTemplateReq,
  ): Promise<Result<ReminderTemplateClientDTO>> {
    return this.httpClient.put(`${this.templatesUrl}/${id}`, request);
  }

  async deleteReminderTemplate(id: string): Promise<Result<void>> {
    return this.httpClient.delete(`${this.templatesUrl}/${id}`);
  }

  async toggleTemplateEnabled(id: string): Promise<Result<ReminderTemplateClientDTO>> {
    return this.httpClient.post(`${this.templatesUrl}/${id}/toggle`, {});
  }

  async replaceTemplateProfiles(
    templateId: string,
    profileIds: readonly string[],
  ): Promise<Result<ReminderTemplateClientDTO>> {
    return this.httpClient.put(`${this.templatesUrl}/${templateId}/profiles`, {
      profileIds: [...profileIds],
    });
  }

  async getUpcomingReminders(params?: {
    days?: number;
    limit?: number;
    importanceLevel?: string;
    type?: string;
    timezone?: string;
  }): Promise<Result<GetUpcomingRemindersRes>> {
    return this.httpClient.get('/reminders/templates/upcoming', { params });
  }

  async getTodaySchedule(params?: {
    limit?: number;
    includeExpired?: boolean;
    timezone?: string;
  }): Promise<Result<GetReminderTodayScheduleRes>> {
    return this.httpClient.get('/reminders/templates/today-schedule', { params });
  }

  // ===== Group CRUD =====

  async createReminderGroup(
    request: CreateReminderGroupReq,
  ): Promise<Result<ReminderGroupClientDTO>> {
    return this.httpClient.post(this.groupsUrl, request);
  }

  async getReminderGroup(id: string): Promise<Result<ReminderGroupClientDTO>> {
    return this.httpClient.get(`${this.groupsUrl}/${id}`);
  }

  async getReminderGroups(): Promise<Result<ReminderGroupListRes>> {
    return this.httpClient.get(this.groupsUrl);
  }

  async updateReminderGroup(
    id: string,
    request: UpdateReminderGroupReq,
  ): Promise<Result<ReminderGroupClientDTO>> {
    return this.httpClient.patch(`${this.groupsUrl}/${id}`, request);
  }

  async deleteReminderGroup(id: string): Promise<Result<void>> {
    return this.httpClient.delete(`${this.groupsUrl}/${id}`);
  }

  async toggleReminderGroupStatus(id: string): Promise<Result<ReminderGroupClientDTO>> {
    return this.httpClient.post(`${this.groupsUrl}/${id}/toggle`, {});
  }

  async getPreferences(): Promise<Result<UserReminderPreferencesClientDTO>> {
    return this.httpClient.get('/reminders/preferences');
  }

  async updatePreferences(
    data: Record<string, unknown>,
  ): Promise<Result<UserReminderPreferencesClientDTO>> {
    return this.httpClient.patch('/reminders/preferences', data);
  }
}

/**
 * Factory function to create ReminderHttpAdapter
 */
export function createReminderHttpAdapter(httpClient: IResultHttpClient): ReminderHttpAdapter {
  return new ReminderHttpAdapter(httpClient);
}
