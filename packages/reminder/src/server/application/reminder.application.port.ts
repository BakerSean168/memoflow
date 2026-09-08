import type { Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { OperationTimelineEntry, OperationAuditRecord } from '@memoflow/contracts/operations';
import type {
  CreateReminderGroupReq,
  CreateReminderTemplateReq,
  GetReminderTodayScheduleReq,
  GetReminderTodayScheduleRes,
  GetUpcomingRemindersReq,
  GetUpcomingRemindersRes,
  ReminderGroupClientDTO,
  ReminderGroupListRes,
  ReminderHistoryClientDTO,
  ReminderTemplateClientDTO,
  ReminderTemplateListRes,
  RecordReminderResponseReq,
  UpdateReminderGroupReq,
  UpdateReminderPreferencesReq,
  UpdateReminderTemplateReq,
  UserReminderPreferencesClientDTO,
} from '@memoflow/contracts/reminder';

export interface ReminderApplicationPort {
  createTemplate(
    data: CreateReminderTemplateReq,
    ctx: ExecutionContext,
  ): Promise<Result<ReminderTemplateClientDTO>>;
  listTemplates(ctx: ExecutionContext): Promise<Result<ReminderTemplateListRes>>;
  getUpcomingReminders(
    params: GetUpcomingRemindersReq,
    ctx: ExecutionContext,
  ): Promise<Result<GetUpcomingRemindersRes>>;
  getTodaySchedule(
    params: GetReminderTodayScheduleReq,
    ctx: ExecutionContext,
  ): Promise<Result<GetReminderTodayScheduleRes>>;
  getTemplate(id: string, ctx: ExecutionContext): Promise<Result<ReminderTemplateClientDTO>>;
  updateTemplate(
    id: string,
    data: UpdateReminderTemplateReq,
    ctx: ExecutionContext,
  ): Promise<Result<ReminderTemplateClientDTO>>;
  deleteTemplate(id: string, ctx: ExecutionContext): Promise<Result<unknown>>;
  toggleTemplate(id: string, ctx: ExecutionContext): Promise<Result<ReminderTemplateClientDTO>>;
  replaceTemplateProfiles(
    id: string,
    profileIds: readonly string[],
    ctx: ExecutionContext,
  ): Promise<Result<ReminderTemplateClientDTO>>;
  getTemplateHistory(
    id: string,
    ctx: ExecutionContext,
  ): Promise<Result<ReminderHistoryClientDTO[]>>;
  recordResponse(
    templateId: string,
    data: RecordReminderResponseReq,
    ctx: ExecutionContext,
  ): Promise<Result<unknown>>;
  getTemplateResponses(templateId: string, ctx: ExecutionContext): Promise<Result<unknown>>;
  getResponseStats(templateId: string, ctx: ExecutionContext): Promise<Result<unknown>>;
  analyzeFrequency(templateId: string, ctx: ExecutionContext): Promise<Result<unknown>>;
  adjustFrequency(
    templateId: string,
    data: { action: string; customInterval?: number },
    ctx: ExecutionContext,
  ): Promise<Result<unknown>>;
  createGroup(
    data: CreateReminderGroupReq,
    ctx: ExecutionContext,
  ): Promise<Result<ReminderGroupClientDTO>>;
  listGroups(ctx: ExecutionContext): Promise<Result<ReminderGroupListRes>>;
  getGroup(id: string, ctx: ExecutionContext): Promise<Result<ReminderGroupClientDTO>>;
  updateGroup(
    id: string,
    data: UpdateReminderGroupReq,
    ctx: ExecutionContext,
  ): Promise<Result<ReminderGroupClientDTO>>;
  deleteGroup(id: string, ctx: ExecutionContext): Promise<Result<unknown>>;
  toggleGroup(id: string, ctx: ExecutionContext): Promise<Result<ReminderGroupClientDTO>>;
  getPreferences(ctx: ExecutionContext): Promise<Result<UserReminderPreferencesClientDTO>>;
  updatePreferences(
    data: UpdateReminderPreferencesReq,
    ctx: ExecutionContext,
  ): Promise<Result<UserReminderPreferencesClientDTO>>;
  queryOperationTimeline(ctx: ExecutionContext): Promise<Result<OperationTimelineEntry[]>>;
  replayOperation(operationId: string, ctx: ExecutionContext): Promise<Result<unknown>>;
  getOperationAudit(ctx: ExecutionContext): Promise<Result<OperationAuditRecord[]>>;
}
