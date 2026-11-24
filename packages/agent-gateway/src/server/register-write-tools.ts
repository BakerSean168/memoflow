import {
  GatewayRoutineReceiptSchema,
  GatewayRoutineUpdateReceiptSchema,
  GatewayRoutineDeleteReceiptSchema,
  GatewayRoutineOverrideReceiptSchema,
  GatewayGoalReceiptSchema,
  GatewayTaskReceiptSchema,
  NotificationMarkReadOutputSchema,
  NotificationMarkUnreadOutputSchema,
  NotificationArchiveOutputSchema,
  NotificationRestoreOutputSchema,
  NotificationPreferencesOutputSchema,
  ScheduleWriteReceiptSchema,
  ScheduleRescheduleReceiptSchema,
  ScheduleDeleteReceiptSchema,
} from '../contracts';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { writeToolDescriptors } from '../write-tool-descriptors';
import type { GatewayWritePort, GatewayWriteAuthority } from '../ports';
import type { ReadToolCall } from './register-read-tools';
export function registerWriteTools(
  server: McpServer,
  writes: GatewayWritePort,
  context: ExecutionContext,
  scopes: readonly string[],
  authority: GatewayWriteAuthority,
  call: ReadToolCall,
) {
  const d = writeToolDescriptors;
  const routineCreate = writes.routineCreate;
  const routineUpdate = writes.routineUpdate;
  const routineDelete = writes.routineDelete;
  const routinePause = writes.routinePause;
  const routineOverride = writes.routineOverride;
  if (routineCreate && scopes.includes('routines:write')) {
    server.registerTool('routine_create', d.routine_create.definition, (input) =>
      call('routine_create', 'routines:write', () =>
        routineCreate(input, context, authority).then((result) =>
          GatewayRoutineReceiptSchema.parse(result),
        ),
      ),
    );
  }
  if (routineUpdate && scopes.includes('routines:write')) {
    server.registerTool('routine_update', d.routine_update.definition, (input) =>
      call('routine_update', 'routines:write', () =>
        routineUpdate(input, context, authority).then((result) =>
          GatewayRoutineUpdateReceiptSchema.parse(result),
        ),
      ),
    );
  }
  if (routineDelete && scopes.includes('routines:write')) {
    server.registerTool('routine_delete', d.routine_delete.definition, (input) =>
      call('routine_delete', 'routines:write', () =>
        routineDelete(input, context, authority).then((result) =>
          GatewayRoutineDeleteReceiptSchema.parse(result),
        ),
      ),
    );
  }
  if (routinePause && scopes.includes('routines:write')) {
    server.registerTool('routine_pause', d.routine_pause.definition, (input) =>
      call('routine_pause', 'routines:write', () =>
        routinePause(input, context, authority).then((result) =>
          GatewayRoutineOverrideReceiptSchema.parse(result),
        ),
      ),
    );
  }
  if (routineOverride && scopes.includes('routines:write')) {
    server.registerTool('routine_override', d.routine_override.definition, (input) =>
      call('routine_override', 'routines:write', () =>
        routineOverride(input, context, authority).then((result) =>
          GatewayRoutineOverrideReceiptSchema.parse(result),
        ),
      ),
    );
  }
  if (scopes.includes('goals:write')) {
    server.registerTool('goal_create', d.goal_create.definition, (input) =>
      call('goal_create', 'goals:write', () =>
        writes
          .goalCreate(input, context, authority)
          .then((result) => GatewayGoalReceiptSchema.parse(result)),
      ),
    );
    server.registerTool('goal_update', d.goal_update.definition, (input) =>
      call('goal_update', 'goals:write', () =>
        writes
          .goalUpdate(input, context, authority)
          .then((result) => GatewayGoalReceiptSchema.parse(result)),
      ),
    );
    server.registerTool('goal_key_result_create', d.goal_key_result_create.definition, (input) =>
      call('goal_key_result_create', 'goals:write', () =>
        writes
          .keyResultCreate(input, context, authority)
          .then((result) => GatewayGoalReceiptSchema.parse(result)),
      ),
    );
    server.registerTool('goal_key_result_update', d.goal_key_result_update.definition, (input) =>
      call('goal_key_result_update', 'goals:write', () =>
        writes
          .keyResultUpdate(input, context, authority)
          .then((result) => GatewayGoalReceiptSchema.parse(result)),
      ),
    );
  }
  if (scopes.includes('tasks:write')) {
    server.registerTool('task_plan_create', d.task_plan_create.definition, (input) =>
      call('task_plan_create', 'tasks:write', () =>
        writes
          .taskCreate(input, context, authority)
          .then((result) => GatewayTaskReceiptSchema.parse(result)),
      ),
    );
    server.registerTool('task_plan_update', d.task_plan_update.definition, (input) =>
      call('task_plan_update', 'tasks:write', () =>
        writes
          .taskUpdate(input, context, authority)
          .then((result) => GatewayTaskReceiptSchema.parse(result)),
      ),
    );
    server.registerTool(
      'task_occurrence_complete',
      d.task_occurrence_complete.definition,
      (input) =>
        call('task_occurrence_complete', 'tasks:write', () =>
          writes
            .taskComplete(input, context, authority)
            .then((result) => GatewayTaskReceiptSchema.parse(result)),
        ),
    );
  }
  const markRead = writes.notificationMarkRead;
  if (markRead && scopes.includes('notifications:write')) {
    server.registerTool('notification_mark_read', d.notification_mark_read.definition, (input) =>
      call('notification_mark_read', 'notifications:write', () =>
        markRead(input, context, authority).then((result) =>
          NotificationMarkReadOutputSchema.parse(result),
        ),
      ),
    );
  }
  const markUnread = writes.notificationMarkUnread;
  if (markUnread && scopes.includes('notifications:write')) {
    server.registerTool(
      'notification_mark_unread',
      d.notification_mark_unread.definition,
      (input) =>
        call('notification_mark_unread', 'notifications:write', () =>
          markUnread(input, context, authority).then((result) =>
            NotificationMarkUnreadOutputSchema.parse(result),
          ),
        ),
    );
  }
  const archive = writes.notificationArchive;
  if (archive && scopes.includes('notifications:write')) {
    server.registerTool('notification_archive', d.notification_archive.definition, (input) =>
      call('notification_archive', 'notifications:write', () =>
        archive(input, context, authority).then((result) =>
          NotificationArchiveOutputSchema.parse(result),
        ),
      ),
    );
  }
  const restore = writes.notificationRestore;
  if (restore && scopes.includes('notifications:write')) {
    server.registerTool('notification_restore', d.notification_restore.definition, (input) =>
      call('notification_restore', 'notifications:write', () =>
        restore(input, context, authority).then((result) =>
          NotificationRestoreOutputSchema.parse(result),
        ),
      ),
    );
  }
  const preferencesUpdate = writes.notificationPreferencesUpdate;
  if (preferencesUpdate && scopes.includes('notifications:write')) {
    server.registerTool(
      'notification_preferences_update',
      d.notification_preferences_update.definition,
      (input) =>
        call('notification_preferences_update', 'notifications:write', () =>
          preferencesUpdate(input, context, authority).then((result) =>
            NotificationPreferencesOutputSchema.parse(result),
          ),
        ),
    );
  }
  const scheduleCreate = writes.scheduleCreate;
  if (scheduleCreate && scopes.includes('schedules:write')) {
    server.registerTool('schedule_create', d.schedule_create.definition, (input) =>
      call('schedule_create', 'schedules:write', () =>
        scheduleCreate(input, context, authority).then((result) =>
          ScheduleWriteReceiptSchema.parse(result),
        ),
      ),
    );
  }
  const scheduleUpdate = writes.scheduleUpdate;
  if (scheduleUpdate && scopes.includes('schedules:write')) {
    server.registerTool('schedule_update', d.schedule_update.definition, (input) =>
      call('schedule_update', 'schedules:write', () =>
        scheduleUpdate(input, context, authority).then((result) =>
          ScheduleWriteReceiptSchema.parse(result),
        ),
      ),
    );
  }
  const scheduleReschedule = writes.scheduleReschedule;
  if (scheduleReschedule && scopes.includes('schedules:write')) {
    server.registerTool('schedule_reschedule', d.schedule_reschedule.definition, (input) =>
      call('schedule_reschedule', 'schedules:write', () =>
        scheduleReschedule(input, context, authority).then((result) =>
          ScheduleRescheduleReceiptSchema.parse(result),
        ),
      ),
    );
  }
  const scheduleDelete = writes.scheduleDelete;
  if (scheduleDelete && scopes.includes('schedules:write')) {
    server.registerTool('schedule_delete', d.schedule_delete.definition, (input) =>
      call('schedule_delete', 'schedules:write', () =>
        scheduleDelete(input, context, authority).then((result) =>
          ScheduleDeleteReceiptSchema.parse(result),
        ),
      ),
    );
  }
}
