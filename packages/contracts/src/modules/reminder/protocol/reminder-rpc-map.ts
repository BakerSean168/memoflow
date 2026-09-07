import type {
  CreateReminderTemplateReq,
  CreateReminderTemplateRes,
  UpdateReminderTemplateReq,
  UpdateReminderTemplateRes,
  GetUpcomingRemindersReq,
  GetUpcomingRemindersRes,
  GetReminderTodayScheduleReq,
  GetReminderTodayScheduleRes,
} from '../api/reminder-template.dto';
import type {
  CreateReminderGroupReq,
  CreateReminderGroupRes,
  UpdateReminderGroupReq,
  UpdateReminderGroupRes,
} from '../api/reminder-group.dto';
import type { ReminderTemplateClientDTO } from '../aggregates/reminder-template-client';
import type { ReminderGroupClientDTO } from '../aggregates/reminder-group-client';
import type { ReminderTemplateId } from '../../../primitives';

// === Reminder Module RPC Map ===
export type ReminderRpcMap = {
  // === Template Operations ===
  'reminder:create-template': [CreateReminderTemplateReq, CreateReminderTemplateRes];
  'reminder:update-template': [UpdateReminderTemplateReq, UpdateReminderTemplateRes];
  'reminder:get-upcoming': [GetUpcomingRemindersReq, GetUpcomingRemindersRes];
  'reminder:get-today-schedule': [GetReminderTodayScheduleReq, GetReminderTodayScheduleRes];

  // === Template Control ===
  'reminder:enable-template': [{ templateId: ReminderTemplateId }, ReminderTemplateClientDTO];
  'reminder:pause-template': [{ templateId: ReminderTemplateId }, ReminderTemplateClientDTO];
  'reminder:disable-template': [{ templateId: ReminderTemplateId }, ReminderTemplateClientDTO];
  'reminder:delete-template': [{ templateId: ReminderTemplateId }, void];

  // === Group Operations ===
  'reminder-group:create': [CreateReminderGroupReq, CreateReminderGroupRes];
  'reminder-group:update': [UpdateReminderGroupReq, UpdateReminderGroupRes];
  'reminder-group:list': [void, ReminderGroupClientDTO[]];
};
