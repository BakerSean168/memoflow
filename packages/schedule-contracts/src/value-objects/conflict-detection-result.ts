/**
 * Conflict Detection Result Types
 *
 * Defines the structure for conflict detection results, including
 * conflict details and resolution suggestions.
 *
 * @module Schedule
 * @since Story 9.1 (EPIC-SCHEDULE-001)
 */

import { z } from 'zod';
import { brandedId } from '@memoflow/shared-primitives';
import type { ScheduleId } from './schedule-id';
import { ConflictSeverity } from './conflict-severity';

/**
 * Result of conflict detection analysis
 */
export const ConflictSuggestionType = {
  MoveEarlier: 'MoveEarlier',
  MoveLater: 'MoveLater',
  Shorten: 'Shorten',
} as const;

export type ConflictSuggestionType =
  (typeof ConflictSuggestionType)[keyof typeof ConflictSuggestionType];

// Residual 725: conflict detection dual bodies retired — OpenAPI + transport use
// ConflictDetectionResultSchema / ConflictDetailSchema / ConflictSuggestionSchema
// (semantic types are z.infer aliases).
export const ConflictDetailSchema = z.object({
  scheduleId: brandedId<ScheduleId>(),
  scheduleTitle: z.string(),
  overlapStart: z.number(),
  overlapEnd: z.number(),
  overlapDuration: z.number(),
  severity: z
    .enum([ConflictSeverity.Minor, ConflictSeverity.Moderate, ConflictSeverity.Severe])
    .optional(),
});

export const ConflictSuggestionSchema = z.object({
  type: z.enum([
    ConflictSuggestionType.MoveEarlier,
    ConflictSuggestionType.MoveLater,
    ConflictSuggestionType.Shorten,
  ]),
  newStartTime: z.number(),
  newEndTime: z.number(),
  description: z.string().optional(),
});

export const ConflictDetectionResultSchema = z.object({
  hasConflict: z.boolean(),
  conflicts: z.array(ConflictDetailSchema),
  suggestions: z.array(ConflictSuggestionSchema),
});

export type ConflictDetail = z.infer<typeof ConflictDetailSchema>;
export type ConflictSuggestion = z.infer<typeof ConflictSuggestionSchema>;
export type ConflictDetectionResult = z.infer<typeof ConflictDetectionResultSchema>;
