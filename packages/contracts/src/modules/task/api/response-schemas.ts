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
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import { TaskOccurrenceStatus } from '../value-objects/task-occurrence-status';
import { TaskPlanStatus } from '../value-objects/task-plan-status';
import { TaskPlanOutcome } from '../value-objects/task-plan-outcome';
import { TaskPlanCompletionPolicy } from '../value-objects/task-plan-completion-policy';
import { TaskOccurrenceScheduleSnapshotSchema } from '../value-objects/task-occurrence-schedule-snapshot';
import { TaskOccurrenceResultSchema } from '../value-objects/task-occurrence-result';
import { TaskOccurrenceChecklistItemSchema } from '../value-objects/task-occurrence-checklist';
import { ChecklistItemDefinitionSchema } from '../value-objects/checklist-item-definition';

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
  checklist: z.array(ChecklistItemDefinitionSchema),
  labels: z.array(LabelClientDTOSchema),
  status: z.enum(TaskPlanStatus),
  outcome: z.enum(TaskPlanOutcome),
  completionPolicy: z.enum(TaskPlanCompletionPolicy),
  closedAt: z.number().nullable(),
  archivedAt: z.number().nullable(),
  abandonedReason: z.string().nullable(),
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

// TASK-7306: transport exposes the same canonical occurrence truth as the server
// aggregate. `dueAt` / `isOverdue` are explicit Product-Time read projections only.
export const TaskOccurrenceResponseSchema = z.object({
  id: brandedId<TaskOccurrenceId>(),
  planId: brandedId<TaskPlanId>(),
  identityId: brandedId<IdentityId>(),
  occurrenceKey: z.string().min(1),
  scheduleSnapshot: TaskOccurrenceScheduleSnapshotSchema,
  importanceSnapshot: z.enum(ImportanceLevel),
  status: z.enum(TaskOccurrenceStatus),
  actualStartAt: z.number().nullable(),
  result: TaskOccurrenceResultSchema.nullable(),
  checklistState: z.array(TaskOccurrenceChecklistItemSchema),
  dueAt: z.number(),
  isOverdue: z.boolean(),
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
