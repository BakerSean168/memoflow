/**
 * Schedule API Requests
 * 调度模块 API 请求定义
 */

import { z } from 'zod';
import { brandedId } from '../../../../primitives';
import type { IdentityId, ScheduleId } from '../../../../primitives';
import { CalendarEntryRangeSchema } from '../../calendar-entry-range';
import {
  AppliedResolutionSchema,
  CreateScheduleResponseSchema,
  ResolveConflictResponseSchema,
} from '../response-schemas';

// ============ Zod Schemas ============

export const ResolutionStrategySchema = z.enum([
  'AUTO',
  'REJECT',
  'ADJUST_START_TIME',
  'ADJUST_END_TIME',
  'ADJUST_DURATION',
]);

export type ResolutionStrategy = z.infer<typeof ResolutionStrategySchema>;

export const CreateScheduleRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  range: CalendarEntryRangeSchema,
  location: z.string().max(500).optional(),
  attendees: z.array(z.string().email()).optional(),
  autoDetectConflicts: z.boolean().optional(),
});

export const UpdateScheduleRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  range: CalendarEntryRangeSchema.optional(),
  location: z.string().max(500).optional(),
  attendees: z.array(z.string().email()).optional(),
  expectedVersion: z.number().int().positive(),
});

export const DetectConflictsRequestSchema = z.object({
  startTime: z.number().positive(),
  endTime: z.number().positive(),
  excludeId: brandedId<ScheduleId>().optional(),
});

export const GetSchedulesByTimeRangeRequestSchema = z.object({
  startTime: z.number().positive(),
  endTime: z.number().positive(),
});

export const ResolveConflictRequestSchema = z.object({
  resolution: ResolutionStrategySchema,
  newStartTime: z.number().positive().optional(),
  newEndTime: z.number().positive().optional(),
  newDuration: z.number().positive().optional(),
});

// ============ Request Types ============
// Residual 707: request dual bodies retired — OpenAPI + transport use *RequestSchema only.

/** Request DTO for creating a new schedule with automatic conflict detection */
export type CreateScheduleRequest = z.infer<typeof CreateScheduleRequestSchema>;

/** Request DTO for updating a schedule */
export type UpdateScheduleRequest = z.infer<typeof UpdateScheduleRequestSchema>;

/** Request DTO for detecting schedule conflicts for a given time range */
export type DetectConflictsRequest = z.infer<typeof DetectConflictsRequestSchema>;

/** Request DTO for getting schedules within a time range */
export type GetSchedulesByTimeRangeRequest = z.infer<typeof GetSchedulesByTimeRangeRequestSchema>;

/** Request DTO for resolving a schedule conflict */
export type ResolveConflictRequest = z.infer<typeof ResolveConflictRequestSchema>;

// ============ Internal Types (for server-side use only) ============

/**
 * Internal query type for getting schedules within a time range with identity
 * Used by controllers/modules when assembling queries from context
 */
export interface GetSchedulesByTimeRangeInternalQuery {
  startTime: number;
  endTime: number;
  identityId: IdentityId;
}

/**
 * Internal query type for detecting conflicts with identity
 * Used by controllers/modules when assembling queries from context
 */
export interface DetectConflictsInternalQuery {
  startTime: number;
  endTime: number;
  excludeId?: ScheduleId;
  identityId: IdentityId;
}

// ============ Response Types ============
// Residual 663: detect-conflicts response dual wrapper retired
// (live transport body is ConflictDetectionResult).
// Residual 715: create/resolve response dual bodies retired — OpenAPI + transport use *ResponseSchema only.

/** Response DTO for creating a schedule */
export type CreateScheduleResponseDTO = z.infer<typeof CreateScheduleResponseSchema>;

/** Information about the applied resolution */
export type AppliedResolution = z.infer<typeof AppliedResolutionSchema>;

/** Response DTO for resolving a schedule conflict */
export type ResolveConflictResponseDTO = z.infer<typeof ResolveConflictResponseSchema>;

export const DeleteScheduleRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export type DeleteScheduleRequest = z.infer<typeof DeleteScheduleRequestSchema>;
export type UpdateScheduleReq = UpdateScheduleRequest;
export type DeleteScheduleReq = DeleteScheduleRequest;
