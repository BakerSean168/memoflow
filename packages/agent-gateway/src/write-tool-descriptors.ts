import {
  GatewayRoutineCreateSchema,
  GatewayRoutineReceiptSchema,
  GatewayGoalCreateSchema,
  GatewayGoalUpdateSchema,
  GatewayKeyResultCreateSchema,
  GatewayKeyResultUpdateSchema,
  GatewayTaskCreateSchema,
  GatewayTaskUpdateSchema,
  GatewayTaskCompleteSchema,
  GatewayGoalReceiptSchema,
  GatewayTaskReceiptSchema,
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
      'Create one hosted WallClock reminder without profile memberships. Resolve the date/time in the user’s Product Time zone; retry with the same idempotencyKey.',
      GatewayRoutineCreateSchema,
      GatewayRoutineReceiptSchema,
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
} as const;
export type GatewayWriteToolName = keyof typeof writeToolDescriptors;
