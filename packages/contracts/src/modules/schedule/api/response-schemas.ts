/**
 * Schedule - Response Schemas (Zod)
 *
 * OpenAPI 响应体 Zod Schema，路由文件统一从此处导入。
 */

import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type {
  ScheduleTaskId,
  ScheduleId,
  ScheduleExecutionId,
  IdentityId,
} from '../../../primitives';
import { ScheduleTaskStatus } from '../value-objects/schedule-task-status';
import { SourceModule } from '../value-objects/source-module';
import { ExecutionStatus } from '../value-objects/execution-status';
import {
  ConflictDetectionResultSchema,
  ConflictDetailSchema,
  ConflictSuggestionSchema,
} from '../value-objects/conflict-detection-result';

// Residual 725: conflict detection schemas owned by conflict-detection-result.ts
// (re-exported for OpenAPI route consumers).
export { ConflictDetectionResultSchema, ConflictDetailSchema, ConflictSuggestionSchema };

import { ScheduleConfigSchema } from '../value-objects/schedule-config';
import { ExecutionInfoSchema } from '../value-objects/execution-info';
import { RetryPolicySchema } from '../value-objects/retry-policy';
import { TaskMetadataSchema } from '../value-objects/task-metadata';
import { CalendarEntryRangeSchema } from '../calendar-entry-range';

// Residual 749: schedule nested VO response schemas owned by value-objects
// (semantic DTOs are z.infer aliases). Request modules keep local partial schemas
// with different validation/shapes.
export { ScheduleConfigSchema, ExecutionInfoSchema, RetryPolicySchema, TaskMetadataSchema };

// Residual 833: ScheduleExecutionClientDTO dual retired — sole ScheduleExecutionResponseSchema + z.infer
// (semantic type is z.infer alias in entities/schedule-execution-client.ts).
export const ScheduleExecutionResponseSchema = z.object({
  id: brandedId<ScheduleExecutionId>(),
  scheduleTaskId: brandedId<ScheduleTaskId>(),
  executionTime: z.number(),
  status: z.enum(ExecutionStatus),
  duration: z.number().nullable(),
  result: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  retryCount: z.number(),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

// ============ Response Schemas ============

/**
 * ScheduleTask Response Schema
 */
// Residual 831: ScheduleTaskClientDTO dual retired — sole ScheduleTaskResponseSchema + z.infer
// (semantic type is z.infer alias in aggregates/schedule-task-client.ts).
export const ScheduleTaskResponseSchema = z.object({
  id: brandedId<ScheduleTaskId>(),
  identityId: brandedId<IdentityId>(),
  name: z.string(),
  description: z.string().nullable(),
  sourceModule: z.enum(SourceModule),
  sourceEntityId: z.string(),
  status: z.enum(ScheduleTaskStatus),
  enabled: z.boolean(),
  schedule: ScheduleConfigSchema,
  execution: ExecutionInfoSchema,
  retryPolicy: RetryPolicySchema,
  metadata: TaskMetadataSchema,
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
  executions: z.array(ScheduleExecutionResponseSchema).nullable(),
});

/**
 * CalendarEntry (Schedule Event) Response Schema
 */
// Residual 829: CalendarEntryClientDTO dual retired — sole CalendarEntryResponseSchema + z.infer
// (semantic type is z.infer alias in aggregates/calendar-entry-client.ts).
export const CalendarEntryResponseSchema = z.object({
  id: brandedId<ScheduleId>(),
  identityId: brandedId<IdentityId>(),
  title: z.string(),
  description: z.string().optional(),
  range: CalendarEntryRangeSchema,
  location: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * Schedule BatchOperation Response Schema
 */
/** Residual 639: schedule batch result schema (renamed off shared dual name). */
// Residual 717: ScheduleBatchOperationResponseSchema is the sole batch response shape
// (ScheduleBatchOperationResponseDTO is a z.infer alias).
export const ScheduleBatchOperationResponseSchema = z.object({
  success: z.array(z.string()),
  failed: z.array(z.object({ taskId: brandedId<ScheduleTaskId>(), error: z.string() })),
  total: z.number(),
  successCount: z.number(),
  failedCount: z.number(),
});

// ============ Conflict Detection Response Schemas ============
// Residual 663: detect-conflicts OpenAPI body is ConflictDetectionResult (no wrapper dual).
// Residual 679: drop DetectConflictsResponseSchema name dual; routes use ConflictDetectionResultSchema only.
// Residual 725: ConflictDetectionResultSchema owned by value-objects/conflict-detection-result.ts.

/**
 * CreateSchedule (with conflict detection) Response Schema
 */
// Residual 715: CreateSchedule / ResolveConflict OpenAPI schemas are the sole response shapes
// (CreateScheduleResponseDTO / ResolveConflictResponseDTO / AppliedResolution are z.infer aliases).
export const CreateScheduleResponseSchema = z.object({
  schedule: CalendarEntryResponseSchema,
  conflicts: ConflictDetectionResultSchema.optional(),
});

export const AppliedResolutionSchema = z.object({
  strategy: z.string(),
  previousStartTime: z.number().optional(),
  previousEndTime: z.number().optional(),
  changes: z.array(z.string()),
});

/**
 * ResolveConflict Response Schema
 */
export const ResolveConflictResponseSchema = z.object({
  schedule: CalendarEntryResponseSchema,
  conflicts: ConflictDetectionResultSchema,
  applied: AppliedResolutionSchema,
});

// Residual 665: batch-delete OpenAPI body reuses schedule batch operation schema (no dual).
