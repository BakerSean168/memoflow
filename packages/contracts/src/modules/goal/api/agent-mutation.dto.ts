import { z } from 'zod';
import { CreateGoalSchema, UpdateGoalSchema } from './goal-crud.dto';
import { GoalMutationReceiptSchema } from './response-schemas';
/** External callers supply retry identity and expectedVersion, never owner or approval claims. */
export const GoalAgentCreateSchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(200),
    goal: CreateGoalSchema.omit({ id: true }),
  })
  .strict();
export const GoalAgentUpdateSchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(200),
    goalId: GoalMutationReceiptSchema.shape.goalId,
    changes: UpdateGoalSchema,
  })
  .strict();
export const GoalAgentReceiptSchema = z
  .object({
    receiptId: z.string().min(1),
    result: GoalMutationReceiptSchema,
  })
  .strict();
export type GoalAgentReceipt = z.infer<typeof GoalAgentReceiptSchema>;
