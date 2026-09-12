/** Portable Task vNext DTOs — schemaVersion 2. */
import { z } from 'zod';
import { PortableRefSchema, IsoDateString } from './portable-common.dto';
import { TaskGoalBindingTrigger } from '../../task/value-objects/task-goal-binding-trigger';

export const PortableTaskContributionSchema = z.object({
  value: z.number().positive(),
  trigger: z.enum(TaskGoalBindingTrigger),
}).strict();
export type PortableTaskContribution = z.infer<typeof PortableTaskContributionSchema>;

export const PortableTaskPlanSchema = z.object({
  _ref: PortableRefSchema,
  title: z.string(),
  description: z.string().nullable().optional(),
  taskType: z.string(),
  importance: z.string(),
  tags: z.array(z.string()),
  color: z.string().nullable().optional(),
  status: z.string(),
  outcome: z.string(),
  completionPolicy: z.string(),
  closedAt: IsoDateString.nullable().optional(),
  archivedAt: IsoDateString.nullable().optional(),
  abandonedReason: z.string().nullable().optional(),
  goalRef: PortableRefSchema.nullable().optional(),
  keyResultRef: PortableRefSchema.nullable().optional(),
  contribution: PortableTaskContributionSchema.nullable().optional(),
  checklist: z.array(z.unknown()),
  timeConfig: z.unknown(),
  recurrenceRule: z.unknown().nullable().optional(),
  reminderConfig: z.unknown().nullable().optional(),
  lastGeneratedDate: IsoDateString.nullable().optional(),
  generateAheadDays: z.number().int().nullable().optional(),
  createdAt: IsoDateString.optional(),
  updatedAt: IsoDateString.optional(),
}).strict().superRefine((task, ctx) => {
  const hasGoalRef = task.goalRef != null;
  const hasKeyResultRef = task.keyResultRef != null;
  if (hasGoalRef !== hasKeyResultRef) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Task goal link requires both goalRef and keyResultRef' });
  }
  if (!hasGoalRef && task.contribution != null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Task contribution requires a Goal/KR link' });
  }
});
export type PortableTaskPlan = z.infer<typeof PortableTaskPlanSchema>;

export const PortableTaskOccurrenceSchema = z.object({
  _ref: PortableRefSchema,
  templateRef: PortableRefSchema,
  instanceDate: IsoDateString,
  occurrenceKey: z.string().nullable().optional(),
  timeConfig: z.unknown(),
  importance: z.string(),
  status: z.string(),
  actualStartTime: IsoDateString.nullable().optional(),
  actualEndTime: IsoDateString.nullable().optional(),
  note: z.string().nullable().optional(),
  createdAt: IsoDateString.optional(),
  updatedAt: IsoDateString.optional(),
}).strict();
export type PortableTaskOccurrence = z.infer<typeof PortableTaskOccurrenceSchema>;

export const PortableTaskDataSchema = z.object({
  templates: z.array(PortableTaskPlanSchema),
  instances: z.array(PortableTaskOccurrenceSchema),
}).strict();
export type PortableTaskData = z.infer<typeof PortableTaskDataSchema>;
