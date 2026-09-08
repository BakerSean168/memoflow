/**
 * Task - Response Schemas (Zod)
 *
 * OpenAPI 响应体 Zod Schema，路由文件统一从此处导入。
 * These schemas must match what controllers actually return (the ClientDTO interfaces).
 */

import { z } from 'zod';
import { LabelClientDTOSchema } from '../../label';
import { brandedId } from '../../../primitives';
import type { TaskTemplateId, TaskInstanceId, IdentityId } from '../../../primitives';
import {
  TaskGoalBindingSchema,
  TaskReminderConfigSchema,
  TaskTimeConfigSchema,
  RecurrenceConfigSchema,
} from './task-template.dto';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import { TaskInstanceStatus } from '../value-objects/task-instance-status';
import { TaskTemplateStatus } from '../value-objects/task-template-status';
import { TaskPlanOutcome } from '../value-objects/task-plan-outcome';
import { TaskPlanCompletionPolicy } from '../value-objects/task-plan-completion-policy';

// ============ TaskTemplate Response Schema ============

export const TaskTemplateResponseSchema = z.object({
  id: brandedId<TaskTemplateId>(),
  identityId: brandedId<IdentityId>(),
  name: z.string(),
  description: z.string().nullable(),
  timeConfig: TaskTimeConfigSchema,
  recurrenceRule: RecurrenceConfigSchema.nullable(),
  reminderConfig: TaskReminderConfigSchema.nullable(),
  importance: z.enum(ImportanceLevel),
  goalBinding: TaskGoalBindingSchema.nullable(),
  labels: z.array(LabelClientDTOSchema),
  status: z.enum(TaskTemplateStatus),
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
  startDate: z.number().nullable(),
  dueDate: z.number().nullable(),
  completedAt: z.number().nullable(),
  estimatedMinutes: z.number().nullable(),
  actualMinutes: z.number().nullable(),
  comment: z.string().nullable(),
  instanceCount: z.number(),
  completedInstanceCount: z.number(),
  pendingInstanceCount: z.number(),
  dueInstanceCount: z.number(),
  completedDueInstanceCount: z.number(),
  completionWindowDays: z.literal(30),
  futurePendingInstanceCount: z.number(),
  singleInstanceStatus: z.enum(TaskInstanceStatus).nullable(),
  completionRate: z.number(),
});

export const CreateTaskTemplateResponseSchema = z.object({
  template: TaskTemplateResponseSchema,
  instanceCount: z.number().int().nonnegative(),
  todayInstanceCreated: z.boolean(),
});

export const TaskTemplateListResponseSchema = z.object({
  templates: z.array(TaskTemplateResponseSchema),
  total: z.number(),
});

// ============ TaskInstance Response Schema ============

// Residual 831: TaskInstanceClientDTO dual retired — sole TaskInstanceResponseSchema + z.infer
// (semantic type is z.infer alias in aggregates/task-instance-client.ts).
export const TaskInstanceResponseSchema = z.object({
  id: brandedId<TaskInstanceId>(),
  templateId: brandedId<TaskTemplateId>(),
  identityId: brandedId<IdentityId>(),
  instanceDate: z.number(),
  timeConfig: TaskTimeConfigSchema,
  importance: z.enum(ImportanceLevel).optional(),
  status: z.enum(TaskInstanceStatus),
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

export type TaskTemplateResponse = z.infer<typeof TaskTemplateResponseSchema>;
export type TaskInstanceResponse = z.infer<typeof TaskInstanceResponseSchema>;

// Residual 837: TaskTemplateHistoryClientDTO dual retired — sole TaskTemplateHistoryResponseSchema + z.infer
// (semantic type is z.infer alias in entities/task-template-history-client.ts).
// Residual 843: TaskTemplateHistoryServerDTO also z.infer of this schema (client+server single-track).
export const TaskTemplateHistoryResponseSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  action: z.string(),
  changes: z.unknown(),
  createdAt: z.number(),
});
