import { z } from 'zod';
import { CreateTaskPlanSchema, UpdateTaskPlanSchema } from './task-plan.dto';
import { TaskPlanReadIdSchema, TaskOccurrenceReadIdSchema } from './read-page.dto';
import { CompleteTaskOccurrenceBodySchema } from './task-occurrence.dto';
import { TaskPlanResponseSchema, TaskOccurrenceResponseSchema } from './response-schemas';
import { TaskGoalMeasurementSchema } from '../value-objects/task-goal-binding';
const key = z.string().trim().min(1).max(200);
export const TaskAgentCreateSchema = z
  .object({
    idempotencyKey: key,
    plan: CreateTaskPlanSchema.omit({ id: true }).extend({
      name: z.string().trim().min(1).max(240),
      description: z.string().max(10000).nullish(),
    }),
  })
  .strict();
export const TaskAgentUpdateSchema = z
  .object({
    idempotencyKey: key,
    planId: TaskPlanReadIdSchema,
    changes: UpdateTaskPlanSchema.extend({
      expectedVersion: z.number().int().positive(),
      name: z.string().trim().min(1).max(240).optional(),
      description: z.string().max(10000).nullish(),
    }),
  })
  .strict();
export const TaskAgentCompleteSchema = z
  .object({
    idempotencyKey: key,
    occurrenceId: TaskOccurrenceReadIdSchema,
    expectedVersion: z.number().int().positive(),
    completion: z.discriminatedUnion('decision', [
      z.object({ decision: z.literal('complete_only') }).strict(),
      z.object({ decision: z.literal('record'), measurement: TaskGoalMeasurementSchema }).strict(),
    ]),
    details: CompleteTaskOccurrenceBodySchema.omit({
      goalMeasurement: true,
      expectedVersion: true,
    })
      .extend({
        duration: z.number().nonnegative().max(604800).optional(),
        note: z.string().max(10000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const TaskAgentReceiptSchema = z
  .object({
    receiptId: z.string().min(1),
    result: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('plan'),
          plan: TaskPlanResponseSchema,
          occurrenceCount: z.number().int().nonnegative().optional(),
          todayOccurrenceCreated: z.boolean().optional(),
        })
        .strict(),
      z
        .object({ kind: z.literal('occurrence'), occurrence: TaskOccurrenceResponseSchema })
        .strict(),
    ]),
  })
  .strict();
export type TaskAgentReceipt = z.infer<typeof TaskAgentReceiptSchema>;

/**
 * Hosted write retention projection: the exact fields a write response returns.
 * Parsing an older full receipt strips the read body, so replay stays identical
 * while `external_mutation_receipts.result_json` never grows a read model.
 */
export const TaskAgentPersistedResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('plan'),
    plan: TaskPlanResponseSchema.pick({ id: true, version: true }),
    occurrenceCount: z.number().int().nonnegative().optional(),
    todayOccurrenceCreated: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('occurrence'),
    occurrence: TaskOccurrenceResponseSchema.pick({
      id: true,
      planId: true,
      version: true,
      status: true,
    }),
  }),
]);
export const TaskAgentPersistedReceiptSchema = z
  .object({
    receiptId: z.string().min(1),
    result: TaskAgentPersistedResultSchema,
  })
  .strict();
export type TaskAgentPersistedResult = z.infer<typeof TaskAgentPersistedResultSchema>;
export type TaskAgentPersistedReceipt = z.infer<typeof TaskAgentPersistedReceiptSchema>;
