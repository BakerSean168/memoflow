import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { IdentityId, GoalId, KeyResultId, TaskPlanId } from '../../../primitives';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import type { TaskPlanClientDTO } from '../aggregates/task-plan-client';
import type { TaskOccurrenceClientDTO } from '../aggregates/task-occurrence-client';
import { TaskPlanCompletionPolicy } from '../value-objects/task-plan-completion-policy';
import { TaskReminderConfigSchema } from '../value-objects/task-reminder-config';
import { TaskGoalBindingSchema } from '../value-objects/task-goal-binding';
import { TaskPlanScheduleSchema } from '../value-objects/task-plan-schedule';
import { TaskPlanChecklistSchema } from '../value-objects/checklist-item-definition';

// Residual 739: TaskReminderConfigSchema / TaskGoalBindingSchema owned by value-objects
// (semantic DTOs are z.infer aliases). Re-export for OpenAPI/route consumers.
export { TaskReminderConfigSchema, TaskGoalBindingSchema };

export { TaskPlanScheduleSchema };

// Public transport schema - NO identityId (injected from Context)
export const CreateTaskPlanSchema = z
  .object({
    id: brandedId<TaskPlanId>().optional(),
    name: z.string().min(1, '标题不能为空'),
    description: z.string().optional().nullable(),
    schedule: TaskPlanScheduleSchema,
    reminderConfig: TaskReminderConfigSchema.optional().nullable(),
    importance: z.enum(ImportanceLevel),
    labelIds: z.array(z.string().min(1)).max(50).optional(),
    goalBinding: TaskGoalBindingSchema.optional().nullable(),
    checklist: TaskPlanChecklistSchema.optional(),
    completionPolicy: z.enum(TaskPlanCompletionPolicy).optional(),
  })
  .strict();

export type CreateTaskPlanReq = z.infer<typeof CreateTaskPlanSchema>;

// Internal input type (used by controller -> use case) with identityId
export interface CreateTaskPlanInput extends CreateTaskPlanReq {
  identityId: IdentityId;
}
export type CreateTaskPlanRes = {
  plan: TaskPlanClientDTO;
  occurrenceCount: number;
  todayOccurrenceCreated: boolean;
};

export const UpdateTaskPlanSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    schedule: TaskPlanScheduleSchema.optional(),
    reminderConfig: TaskReminderConfigSchema.optional().nullable(),
    importance: z.enum(ImportanceLevel).optional(),
    labelIds: z.array(z.string().min(1)).max(50).optional(),
    goalBinding: TaskGoalBindingSchema.optional().nullable(),
    checklist: TaskPlanChecklistSchema.optional(),
    completionPolicy: z.enum(TaskPlanCompletionPolicy).optional(),
    /** R2-5a：乐观锁期望版本（可选；提供时校验，旧客户端可不传）。 */
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();

export type UpdateTaskPlanReq = z.infer<typeof UpdateTaskPlanSchema>;
export type UpdateTaskPlanRes = TaskPlanClientDTO;

export const AbandonTaskPlanSchema = z
  .object({
    reason: z.string().trim().min(1).optional(),
  })
  .default({});
export type AbandonTaskPlanReq = z.infer<typeof AbandonTaskPlanSchema>;

// Public transport schema - NO identityId (injected from Context)
export const ListTaskPlanFiltersSchema = z
  .object({
    status: z.array(z.string()).optional(),
    goalId: brandedId<GoalId>().optional(),
    keyResultId: brandedId<KeyResultId>().optional(),
    labelIdsAll: z.array(z.string().min(1)).max(50).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.keyResultId && !value.goalId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['goalId'],
        message: 'Key Result task filtering requires its owning Goal',
      });
    }
  });

export type ListTaskPlanFilters = z.infer<typeof ListTaskPlanFiltersSchema>;

export const TaskPlanOccurrencesQuerySchema = z.object({
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
});

export type TaskPlanOccurrencesQuery = z.infer<typeof TaskPlanOccurrencesQuerySchema>;

// Internal query type (used by controller -> use case) with identityId
export interface QueryTaskPlansInternal {
  identityId: IdentityId;
  status?: string[];
  goalId?: GoalId;
  keyResultId?: KeyResultId;
  labelIdsAll?: string[];
}
export interface QueryTaskPlansRes {
  plans: TaskPlanClientDTO[];
  total: number;
}

export const GenerateOccurrencesSchema = z.object({
  fromDate: z.number(),
  toDate: z.number(),
});

export type GenerateOccurrencesReq = z.infer<typeof GenerateOccurrencesSchema>;
export type GenerateOccurrencesRes = TaskOccurrenceClientDTO[];

// Residual 667: bind-to-goal request reuses TaskGoalBindingSchema (no dual body).
export type BindToGoalReq = z.infer<typeof TaskGoalBindingSchema>;
export type BindToGoalRes = TaskPlanClientDTO;

export type UnbindFromGoalReq = void;
export type UnbindFromGoalRes = TaskPlanClientDTO;

export type GetTaskPlanReq = { id: TaskPlanId };
export type GetTaskPlanRes = TaskPlanClientDTO | null;
