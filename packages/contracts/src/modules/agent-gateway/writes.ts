import { z } from 'zod';
import {
  GoalAgentCreateSchema,
  GoalAgentUpdateSchema,
  GoalAgentKeyResultCreateSchema,
  GoalAgentKeyResultUpdateSchema,
  GoalAgentPersistedReceiptSchema,
} from '../goal';
import {
  TaskAgentCreateSchema,
  TaskAgentUpdateSchema,
  TaskAgentCompleteSchema,
  TaskAgentPersistedReceiptSchema,
} from '../task';

/**
 * Gateway descriptors compose owner schemas; no goal field semantics are
 * redefined here. Referencing the owner schema directly keeps the MCP edge and
 * the owner adapter on one contract and avoids module-load schema projection.
 */
export const GatewayGoalCreateSchema = GoalAgentCreateSchema;
/** W1 patches Goal fields only; KR replacement has its own tools. */
export const GatewayGoalUpdateSchema = GoalAgentUpdateSchema.extend({
  changes: GoalAgentUpdateSchema.shape.changes.omit({ keyResults: true }).strict(),
});
export const GatewayKeyResultCreateSchema = GoalAgentKeyResultCreateSchema;
export const GatewayKeyResultUpdateSchema = GoalAgentKeyResultUpdateSchema;
export const GatewayTaskCreateSchema = TaskAgentCreateSchema.extend({
  plan: TaskAgentCreateSchema.shape.plan.strict(),
});
export const GatewayTaskUpdateSchema = TaskAgentUpdateSchema.extend({
  changes: TaskAgentUpdateSchema.shape.changes.strict(),
});
export const GatewayTaskCompleteSchema = TaskAgentCompleteSchema;
/** A write grant returns only mutation identity/version, not protected read bodies. */
export const GatewayGoalReceiptSchema = GoalAgentPersistedReceiptSchema.extend({
  replayed: z.boolean(),
});
export const GatewayTaskReceiptSchema = TaskAgentPersistedReceiptSchema.extend({
  replayed: z.boolean(),
});

import { RoutineAgentCreateSchema, RoutineAgentPersistedReceiptSchema } from '../routine';
export const GatewayRoutineCreateSchema = RoutineAgentCreateSchema;
export const GatewayRoutineReceiptSchema = RoutineAgentPersistedReceiptSchema.extend({
  replayed: z.boolean(),
});
