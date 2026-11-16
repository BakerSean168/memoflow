import {
  GatewayRoutineCreateSchema,
  GatewayRoutineDeleteSchema,
  GatewayRoutineOverrideSchema,
  GatewayRoutinePauseSchema,
  GatewayRoutineUpdateSchema,
  GatewayRoutineReceiptSchema,
  GatewayRoutineUpdateReceiptSchema,
  GatewayRoutineDeleteReceiptSchema,
  GatewayRoutineOverrideReceiptSchema,
  GatewayGoalCreateSchema,
  GatewayGoalUpdateSchema,
  GatewayKeyResultCreateSchema,
  GatewayKeyResultUpdateSchema,
  GatewayTaskCreateSchema,
  GatewayTaskUpdateSchema,
  GatewayTaskCompleteSchema,
  GatewayGoalReceiptSchema,
  GatewayTaskReceiptSchema,
  NotificationMarkReadInputSchema,
  NotificationMarkReadOutputSchema,
} from './contracts';
const annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
function definition<I, O>(description: string, inputSchema: I, outputSchema: O) {
  return { description, inputSchema, outputSchema, annotations };
}
export const writeToolDescriptors = {
  routine_create: {
    requiredScope: 'routines:write',
    definition: definition(
      'Create one hosted WallClock reminder or recurrence without profile memberships. Resolve the date/time in the user’s Product Time zone; retry with the same idempotencyKey.',
      GatewayRoutineCreateSchema,
      GatewayRoutineReceiptSchema,
    ),
  },
  routine_update: {
    requiredScope: 'routines:write',
    definition: definition(
      'Patch an owned Routine using expectedVersion. Trigger changes accept only hosted WallClock schedules.',
      GatewayRoutineUpdateSchema,
      GatewayRoutineUpdateReceiptSchema,
    ),
  },
  routine_delete: {
    requiredScope: 'routines:write',
    definition: {
      ...definition(
        'Permanently delete an owned Routine using expectedVersion. This cannot be undone.',
        GatewayRoutineDeleteSchema,
        GatewayRoutineDeleteReceiptSchema,
      ),
      annotations: { ...annotations, destructiveHint: true },
    },
  },
  routine_pause: {
    requiredScope: 'routines:write',
    definition: definition(
      'Pause an owned Routine until an instant (epoch ms, at most 30 days ahead) without changing its definition.',
      GatewayRoutinePauseSchema,
      GatewayRoutineOverrideReceiptSchema,
    ),
  },
  routine_override: {
    requiredScope: 'routines:write',
    definition: definition(
      'Set a bounded temporary snooze, suppress or interval override on an owned Routine; expiresAt is required.',
      GatewayRoutineOverrideSchema,
      GatewayRoutineOverrideReceiptSchema,
    ),
  },
  goal_create: {
    requiredScope: 'goals:write',
    definition: definition(
      'Create an owned Goal with initial KRs. Retry using the same idempotencyKey.',
      GatewayGoalCreateSchema,
      GatewayGoalReceiptSchema,
    ),
  },
  goal_update: {
    requiredScope: 'goals:write',
    definition: definition(
      'Patch an owned Goal using expectedVersion. Does not replace KRs.',
      GatewayGoalUpdateSchema,
      GatewayGoalReceiptSchema,
    ),
  },
  goal_key_result_create: {
    requiredScope: 'goals:write',
    definition: definition(
      'Add a KR through its Goal owner using the Goal expectedVersion.',
      GatewayKeyResultCreateSchema,
      GatewayGoalReceiptSchema,
    ),
  },
  goal_key_result_update: {
    requiredScope: 'goals:write',
    definition: definition(
      'Patch a KR through its Goal owner using the Goal expectedVersion.',
      GatewayKeyResultUpdateSchema,
      GatewayGoalReceiptSchema,
    ),
  },
  task_plan_create: {
    requiredScope: 'tasks:write',
    definition: definition(
      'Create a TaskPlan. A Goal binding additionally requires goals:write.',
      GatewayTaskCreateSchema,
      GatewayTaskReceiptSchema,
    ),
  },
  task_plan_update: {
    requiredScope: 'tasks:write',
    definition: definition(
      'Patch a TaskPlan using expectedVersion. Binding changes additionally require goals:write.',
      GatewayTaskUpdateSchema,
      GatewayTaskReceiptSchema,
    ),
  },
  task_occurrence_complete: {
    requiredScope: 'tasks:write',
    definition: definition(
      'Complete an occurrence using expectedVersion and explicit record/complete_only. Existing Goal contributions are durably delivered. Recording measurement also requires goals:read.',
      GatewayTaskCompleteSchema,
      GatewayTaskReceiptSchema,
    ),
  },
  notification_mark_read: {
    requiredScope: 'notifications:write',
    definition: definition(
      'Mark one owned notification as read (idempotent). Notification action execution is not available through MCP.',
      NotificationMarkReadInputSchema,
      NotificationMarkReadOutputSchema,
    ),
  },
} as const;
export type GatewayWriteToolName = keyof typeof writeToolDescriptors;
