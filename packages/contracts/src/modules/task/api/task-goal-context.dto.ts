import { z } from 'zod';
import { TaskPlanOutcome } from '../value-objects/task-plan-outcome';
import { TaskPlanStatus } from '../value-objects/task-plan-status';

/** Bounded pagination for Goal Workspace Task previews/deep links. */
export const TaskGoalContextPageRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
  })
  .strict();
export type TaskGoalContextPageRequest = z.input<typeof TaskGoalContextPageRequestSchema>;

/** Minimal Task-owned read model; Goal must not hydrate Task aggregates directly. */
export const TaskGoalContextItemSchema = z
  .object({
    taskPlanId: z.string().min(1),
    name: z.string().min(1),
    status: z.enum(TaskPlanStatus),
    outcome: z.enum(TaskPlanOutcome),
    keyResultId: z.string().min(1).nullable(),
    hasContribution: z.boolean(),
  })
  .strict();
export type TaskGoalContextItem = z.infer<typeof TaskGoalContextItemSchema>;

export const TaskGoalContextPageSchema = z
  .object({
    items: z.array(TaskGoalContextItemSchema),
    total: z.number().int().min(0),
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().min(0),
  })
  .strict();
export type TaskGoalContextPage = z.infer<typeof TaskGoalContextPageSchema>;

export const TaskGoalContextSummarySchema = z
  .object({
    total: z.number().int().min(0),
    active: z.number().int().min(0),
    completed: z.number().int().min(0),
    goalLevel: z.number().int().min(0),
    byKeyResult: z.array(
      z
        .object({
          keyResultId: z.string().min(1),
          total: z.number().int().min(0),
          active: z.number().int().min(0),
        })
        .strict(),
    ),
  })
  .strict();
export type TaskGoalContextSummary = z.infer<typeof TaskGoalContextSummarySchema>;
