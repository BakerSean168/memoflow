/**
 * Task - Response Schemas (Zod)
 *
 * OpenAPI 响应体 Zod Schema，路由文件统一从此处导入。
 * These schemas must match what controllers actually return (the ClientDTO interfaces).
 */

import { z } from 'zod';
import { LabelClientDTOSchema } from '../../label';
import { brandedId } from '../../../primitives';
import type { TaskPlanId, TaskOccurrenceId, IdentityId } from '../../../primitives';
import {
  TaskGoalBindingSchema,
  TaskReminderConfigSchema,
  TaskPlanScheduleSchema,
} from './task-plan.dto';
import { TaskTimeConfigSchema } from '../value-objects/task-time-config';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import { TaskOccurrenceStatus } from '../value-objects/task-occurrence-status';
import { TaskPlanStatus } from '../value-objects/task-plan-status';
import { TaskPlanOutcome } from '../value-objects/task-plan-outcome';
import { TaskPlanCompletionPolicy } from '../value-objects/task-plan-completion-policy';

// ============ TaskPlan Response Schema ============

export const TaskPlanResponseSchema = z.object({
  id: brandedId<TaskPlanId>(),
  identityId: brandedId<IdentityId>(),
  name: z.string(),
  description: z.string().nullable(),
  schedule: TaskPlanScheduleSchema,
  reminderConfig: TaskReminderConfigSchema.nullable(),
  importance: z.enum(ImportanceLevel),
  goalBinding: TaskGoalBindingSchema.nullable(),
  labels: z.array(LabelClientDTOSchema),
  status: z.enum(TaskPlanStatus),
  outcome: z.enum(TaskPlanOutcome),
  completionPolicy: z.enum(TaskPlanCompletionPolicy),
  closedAt: z.number().nullable(),
  archivedAt: z.number().nullable(),
  abandonedReason: z.string().nullable(),
  lastGeneratedDate: z.number().nullable(),
  generateAheadDays: z.number().nullable(),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
  instanceCount: z.number(),
  completedInstanceCount: z.number(),
  pendingInstanceCount: z.number(),
  dueInstanceCount: z.number(),
  completedDueInstanceCount: z.number(),
  completionWindowDays: z.literal(30),
  futurePendingInstanceCount: z.number(),
  singleInstanceStatus: z.enum(TaskOccurrenceStatus).nullable(),
  completionRate: z.number(),
});

export const CreateTaskPlanResponseSchema = z.object({
  template: TaskPlanResponseSchema,
  instanceCount: z.number().int().nonnegative(),
  todayInstanceCreated: z.boolean(),
});

export const TaskPlanListResponseSchema = z.object({
  templates: z.array(TaskPlanResponseSchema),
  total: z.number(),
});

// ============ TaskOccurrence Response Schema ============

// Residual 831: TaskOccurrenceClientDTO dual retired — sole TaskOccurrenceResponseSchema + z.infer
// (semantic type is z.infer alias in aggregates/task-occurrence-client.ts).
export const TaskOccurrenceResponseSchema = z.object({
  id: brandedId<TaskOccurrenceId>(),
  templateId: brandedId<TaskPlanId>(),
  identityId: brandedId<IdentityId>(),
  instanceDate: z.number(),
  timeConfig: TaskTimeConfigSchema,
  importance: z.enum(ImportanceLevel).optional(),
  status: z.enum(TaskOccurrenceStatus),
  isOverdue: z.boolean(),
  actualStartTime: z.number().nullable(),
  actualEndTime: z.number().nullable(),
  comment: z.string().nullable(),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

// ============ Inferred response aliases ============
// ADR-047: the RPC map imports ONLY inferred types from `../api`; these aliases
// are the type surface the protocol layer references (no `z.infer` in maps).
// ADR-047：RPC map 只从 `../api` 导入推导类型；这些别名是 protocol 层引用的
// 类型表面（map 内不再出现 `z.infer`）。

export type TaskPlanResponse = z.infer<typeof TaskPlanResponseSchema>;
export type TaskOccurrenceResponse = z.infer<typeof TaskOccurrenceResponseSchema>;

// Residual 837: TaskPlanHistoryClientDTO dual retired — sole TaskPlanHistoryResponseSchema + z.infer
// (semantic type is z.infer alias in entities/task-plan-history-client.ts).
// Residual 843: TaskPlanHistoryServerDTO also z.infer of this schema (client+server single-track).
export const TaskPlanHistoryResponseSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  action: z.string(),
  changes: z.unknown(),
  createdAt: z.number(),
});
