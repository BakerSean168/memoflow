import { z } from 'zod';
import {
  GoalAgentCreateSchema,
  GoalAgentUpdateSchema,
  GoalAgentReceiptSchema,
  AddKeyResultSchema,
  UpdateKeyResultSchema,
} from '../goal';
import {
  TaskAgentCreateSchema,
  TaskAgentUpdateSchema,
  TaskAgentCompleteSchema,
  TaskAgentReceiptSchema,
  TaskPlanResponseSchema,
  TaskOccurrenceResponseSchema,
} from '../task';
export const GatewayGoalCreateSchema = GoalAgentCreateSchema.extend({
  goal: GoalAgentCreateSchema.shape.goal
    .extend({
      initialKeyResults: GoalAgentCreateSchema.shape.goal.shape.initialKeyResults
        .unwrap()
        .element.omit({ id: true })
        .array()
        .max(50)
        .optional(),
    })
    .strict(),
});
export const GatewayGoalUpdateSchema = GoalAgentUpdateSchema.extend({
  changes: GoalAgentUpdateSchema.shape.changes.omit({ keyResults: true }).strict(),
});
const keyResultBase = GoalAgentUpdateSchema.omit({ changes: true });
export const GatewayKeyResultCreateSchema = keyResultBase
  .extend({ keyResult: AddKeyResultSchema.omit({ id: true, goalId: true }).strict() })
  .strict();
export const GatewayKeyResultUpdateSchema = keyResultBase
  .extend({
    keyResultId: z.string().min(1),
    changes: UpdateKeyResultSchema.strict(),
  })
  .strict();
export const GatewayTaskCreateSchema = TaskAgentCreateSchema.extend({
  plan: TaskAgentCreateSchema.shape.plan.strict(),
});
export const GatewayTaskUpdateSchema = TaskAgentUpdateSchema.extend({
  changes: TaskAgentUpdateSchema.shape.changes.strict(),
});
export const GatewayTaskCompleteSchema = TaskAgentCompleteSchema;
// A write grant returns only mutation identity/version, not protected read bodies.
export const GatewayGoalReceiptSchema = GoalAgentReceiptSchema.extend({
  result: GoalAgentReceiptSchema.shape.result.pick({
    goalId: true,
    goalVersion: true,
    affectedEntityIds: true,
  }),
  replayed: z.boolean(),
});
export const GatewayTaskReceiptSchema = TaskAgentReceiptSchema.extend({
  result: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('plan'),
      plan: TaskPlanResponseSchema.pick({ id: true, version: true }),
      occurrenceCount: z.number().int().nonnegative().optional(),
      todayOccurrenceCreated: z.boolean().optional(),
    }),
    z.strictObject({
      kind: z.literal('occurrence'),
      occurrence: TaskOccurrenceResponseSchema.pick({
        id: true,
        planId: true,
        version: true,
        status: true,
      }),
    }),
  ]),
  replayed: z.boolean(),
});
