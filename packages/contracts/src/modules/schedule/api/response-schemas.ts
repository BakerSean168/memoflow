import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { ScheduleId, IdentityId } from '../../../primitives';
import {
  ConflictDetectionResultSchema,
  ConflictDetailSchema,
  ConflictSuggestionSchema,
} from '../value-objects/conflict-detection-result';
import { CalendarEntryRangeSchema } from '../calendar-entry-range';

export { ConflictDetectionResultSchema, ConflictDetailSchema, ConflictSuggestionSchema };

// Residual 829: CalendarEntryClientDTO remains z.infer of this sole response schema.
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

export const ResolveConflictResponseSchema = z.object({
  schedule: CalendarEntryResponseSchema,
  conflicts: ConflictDetectionResultSchema,
  applied: AppliedResolutionSchema,
});
