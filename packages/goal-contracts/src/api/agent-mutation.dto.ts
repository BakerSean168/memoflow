import { z } from 'zod';
import { CreateGoalSchema, UpdateGoalSchema } from './goal-crud.dto';
import { AddKeyResultSchema, UpdateKeyResultSchema } from './key-result.dto';
import { KeyResultInputSchema } from './key-result-input.schema';
import { GoalMutationReceiptSchema } from './response-schemas';

/**
 * Agent mutation contract owned by Goal. External callers supply retry identity
 * and expectedVersion, never owner, approval or deterministic entity claims.
 * The Agent Gateway composes these schemas; Goal never imports the gateway.
 */
const idempotencyKey = z.string().trim().min(1).max(200);
const goalId = GoalMutationReceiptSchema.shape.goalId;

export const GoalAgentCreateSchema = z
  .object({
    idempotencyKey,
    goal: CreateGoalSchema.omit({ id: true, nativeAiLease: true })
      .extend({
        initialKeyResults: z
          .array(KeyResultInputSchema.omit({ id: true }))
          .max(50)
          .optional(),
      })
      .strict(),
  })
  .strict();

export const GoalAgentUpdateSchema = z
  .object({
    idempotencyKey,
    goalId,
    changes: UpdateGoalSchema,
  })
  .strict();

export const GoalAgentKeyResultCreateSchema = z
  .object({
    idempotencyKey,
    goalId,
    keyResult: AddKeyResultSchema.omit({ id: true, goalId: true }).strict(),
  })
  .strict();

export const GoalAgentKeyResultUpdateSchema = z
  .object({
    idempotencyKey,
    goalId,
    keyResultId: z.string().min(1),
    changes: UpdateKeyResultSchema.strict(),
  })
  .strict();

/**
 * A hosted write grant returns only mutation identity/version and affected
 * entity IDs. The owner's full read model must never be persisted in the
 * receipt: a `goals:write`-only credential has no read scope. Parsing also
 * strips an older full receipt so a pre-existing row can still replay.
 */
export const GoalAgentPersistedResultSchema = GoalMutationReceiptSchema.pick({
  goalId: true,
  goalVersion: true,
  affectedEntityIds: true,
});

export const GoalAgentPersistedReceiptSchema = z
  .object({
    receiptId: z.string().min(1),
    result: GoalAgentPersistedResultSchema,
  })
  .strict();

/** Local desktop hosts may return the full owner receipt inside the app. */
export const GoalAgentReceiptSchema = z
  .object({
    receiptId: z.string().min(1),
    result: GoalMutationReceiptSchema,
  })
  .strict();

export type GoalAgentPersistedResult = z.infer<typeof GoalAgentPersistedResultSchema>;
export type GoalAgentPersistedReceipt = z.infer<typeof GoalAgentPersistedReceiptSchema>;
export type GoalAgentReceipt = z.infer<typeof GoalAgentReceiptSchema>;
