import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { IdentityId, GoalId, TaskTemplateId } from '../../../primitives';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import type { TaskTemplateClientDTO } from '../aggregates/task-template-client';
import type { TaskInstanceClientDTO } from '../aggregates/task-instance-client';
import { TaskType } from '../value-objects/task-type';
import { TaskPlanCompletionPolicy } from '../value-objects/task-plan-completion-policy';
import { TaskReminderConfigSchema } from '../value-objects/task-reminder-config';
import { TaskGoalBindingSchema } from '../value-objects/task-goal-binding';
import { RecurrenceConfigSchema } from '../value-objects/recurrence-rule';
import { TaskTimeConfigSchema } from '../value-objects/task-time-config';

// Residual 739: TaskReminderConfigSchema / TaskGoalBindingSchema owned by value-objects
// (semantic DTOs are z.infer aliases). Re-export for OpenAPI/route consumers.
export { TaskReminderConfigSchema, TaskGoalBindingSchema };

// Residual 743: RecurrenceConfigSchema owned by value-objects
// (semantic RecurrenceRuleDTO / RecurrenceConfigReq are z.infer aliases).
export { RecurrenceConfigSchema };
export type { RecurrenceConfigReq } from '../value-objects/recurrence-rule';

// Residual 747: TaskTimeConfigSchema owned by value-objects
// (semantic TaskTimeConfigDTO / TaskTimeConfigReq are z.infer aliases).
// Domain TaskTimeConfig startDate is Instant (ADR-037; intentional dual interface names).
export { TaskTimeConfigSchema };
export type { TaskTimeConfigReq } from '../value-objects/task-time-config';

// Public transport schema - NO identityId (injected from Context)
export const CreateTaskTemplateSchema = z
  .object({
    id: brandedId<TaskTemplateId>().optional(),
    name: z.string().min(1, '标题不能为空'),
    description: z.string().optional().nullable(),
    taskType: z.enum([TaskType.OneTime, TaskType.Recurring]).default(TaskType.Recurring),
    timeConfig: TaskTimeConfigSchema,
    recurrenceRule: RecurrenceConfigSchema.optional().nullable(),
    reminderConfig: TaskReminderConfigSchema.optional().nullable(),
    importance: z.enum(ImportanceLevel),
    labelIds: z.array(z.string().min(1)).max(50).optional(),
    goalBinding: TaskGoalBindingSchema.optional().nullable(),
    completionPolicy: z.enum(TaskPlanCompletionPolicy).optional(),
  })
  .strict();

export type CreateTaskTemplateReq = z.infer<typeof CreateTaskTemplateSchema>;

// Internal input type (used by controller -> use case) with identityId
export interface CreateTaskTemplateInput extends CreateTaskTemplateReq {
  identityId: IdentityId;
}
export type CreateTaskTemplateRes = {
  template: TaskTemplateClientDTO;
  instanceCount: number;
  todayInstanceCreated: boolean;
};

export const UpdateTaskTemplateSchema = z
  .object({
    templateId: brandedId<TaskTemplateId>().optional(),
    name: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    timeConfig: TaskTimeConfigSchema.optional().nullable(),
    recurrenceRule: RecurrenceConfigSchema.optional().nullable(),
    reminderConfig: TaskReminderConfigSchema.optional().nullable(),
    importance: z.enum(ImportanceLevel).optional(),
    labelIds: z.array(z.string().min(1)).max(50).optional(),
    goalBinding: TaskGoalBindingSchema.optional().nullable(),
    completionPolicy: z.enum(TaskPlanCompletionPolicy).optional(),
    /** R2-5a：乐观锁期望版本（可选；提供时校验，旧客户端可不传）。 */
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();

export type UpdateTaskTemplateReq = z.infer<typeof UpdateTaskTemplateSchema>;
export type UpdateTaskTemplateRes = TaskTemplateClientDTO;

export const AbandonTaskPlanSchema = z
  .object({
    reason: z.string().trim().min(1).optional(),
  })
  .default({});
export type AbandonTaskPlanReq = z.infer<typeof AbandonTaskPlanSchema>;

// Public transport schema - NO identityId (injected from Context)
export const ListTaskTemplateFiltersSchema = z.object({
  status: z.array(z.string()).optional(),
  goalId: brandedId<GoalId>().optional(),
  labelIdsAll: z.array(z.string().min(1)).max(50).optional(),
});

export type ListTaskTemplateFilters = z.infer<typeof ListTaskTemplateFiltersSchema>;

export const TaskTemplateInstancesQuerySchema = z.object({
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
});

export type TaskTemplateInstancesQuery = z.infer<typeof TaskTemplateInstancesQuerySchema>;

// Internal query type (used by controller -> use case) with identityId
export interface QueryTaskTemplatesInternal {
  identityId: IdentityId;
  status?: string[];
  goalId?: GoalId;
  labelIdsAll?: string[];
}
export interface QueryTaskTemplatesRes {
  templates: TaskTemplateClientDTO[];
  total: number;
}

export const GenerateInstancesSchema = z.object({
  fromDate: z.number(),
  toDate: z.number(),
});

export type GenerateInstancesReq = z.infer<typeof GenerateInstancesSchema>;
export type GenerateInstancesRes = TaskInstanceClientDTO[];

// Residual 667: bind-to-goal request reuses TaskGoalBindingSchema (no dual body).
export type BindToGoalReq = z.infer<typeof TaskGoalBindingSchema>;
export type BindToGoalRes = TaskTemplateClientDTO;

export type UnbindFromGoalReq = void;
export type UnbindFromGoalRes = TaskTemplateClientDTO;

export type GetTaskTemplateReq = { id: TaskTemplateId; includeChildren?: boolean };
export type GetTaskTemplateRes = TaskTemplateClientDTO | null;
