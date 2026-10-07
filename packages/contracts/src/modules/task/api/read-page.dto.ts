import { z } from 'zod';
import {
  brandedId,
  ID_PREFIXES,
  YmdSchema,
  type TaskPlanId,
  type TaskOccurrenceId,
} from '../../../primitives';
import { TaskPlanResponseSchema, TaskOccurrenceResponseSchema } from './response-schemas';

/** Epoch milliseconds whose local day remains a canonical four-digit Ymd in any IANA zone. */
export const TaskReadInstantSchema = z.number().int().min(0).max(253402214400000);

export const TaskPlanReadIdSchema = brandedId<TaskPlanId>(ID_PREFIXES.TaskPlanId);
export const TaskOccurrenceReadIdSchema = brandedId<TaskOccurrenceId>(ID_PREFIXES.TaskOccurrenceId);

/** Owned bounded projections reuse the canonical Task schemas; no synthetic statistics. */
export const TaskReadPlanSchema = TaskPlanResponseSchema.pick({
  id: true,
  name: true,
  schedule: true,
  importance: true,
  status: true,
  outcome: true,
  completionPolicy: true,
  version: true,
  createdAt: true,
  updatedAt: true,
}).extend({ id: TaskPlanReadIdSchema });
export const TaskReadOccurrenceSchema = TaskOccurrenceResponseSchema.pick({
  id: true,
  planId: true,
  scheduleSnapshot: true,
  importanceSnapshot: true,
  status: true,
  actualStartAt: true,
  dueAt: true,
  isOverdue: true,
  version: true,
  createdAt: true,
  updatedAt: true,
}).extend({ id: TaskOccurrenceReadIdSchema, planId: TaskPlanReadIdSchema });
export const TaskPlanPositionSchema = z.strictObject({
  createdAt: z.number().int().nonnegative(),
  id: TaskPlanReadIdSchema,
});
export const TaskOccurrencePositionSchema = z.strictObject({
  scheduleDate: YmdSchema,
  id: TaskOccurrenceReadIdSchema,
});
export const TaskPlanReadQuerySchema = z.strictObject({
  query: z.string().trim().max(200).default(''),
  limit: z.number().int().min(1).max(100).default(20),
  after: TaskPlanPositionSchema.optional(),
});
export const TaskOccurrenceReadQuerySchema = z
  .strictObject({
    startDate: TaskReadInstantSchema,
    endDate: TaskReadInstantSchema,
    includeOverdueOpen: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(20),
    after: TaskOccurrencePositionSchema.optional(),
    asOf: TaskReadInstantSchema.optional(),
    timeZone: z.string().max(100).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.endDate < input.startDate || input.endDate - input.startDate > 31 * 86400000)
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'Expected an ordered range of at most 31 days',
      });
  });
export type TaskReadPlan = z.infer<typeof TaskReadPlanSchema>;
export type TaskReadOccurrence = z.infer<typeof TaskReadOccurrenceSchema>;
export type TaskPlanReadQuery = z.infer<typeof TaskPlanReadQuerySchema>;
export type TaskOccurrenceReadQuery = z.infer<typeof TaskOccurrenceReadQuerySchema>;
export interface TaskReadPage<T> {
  items: T[];
  hasMore: boolean;
}
export interface TaskOccurrenceReadPage extends TaskReadPage<TaskReadOccurrence> {
  timeZone: string;
  asOf: number;
}
