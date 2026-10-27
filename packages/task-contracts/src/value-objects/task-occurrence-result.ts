import { z } from 'zod';

export const TaskOccurrenceResultKind = {
  Completed: 'Completed',
  Missed: 'Missed',
  Skipped: 'Skipped',
} as const;
export type TaskOccurrenceResultKind =
  (typeof TaskOccurrenceResultKind)[keyof typeof TaskOccurrenceResultKind];

export const CompletedTaskOccurrenceResultSchema = z.object({
  kind: z.literal(TaskOccurrenceResultKind.Completed),
  recordedAt: z.number().int(),
  actualDurationMinutes: z.number().nonnegative().nullable().default(null),
  note: z.string().max(2000).nullable().default(null),
  rating: z.number().min(1).max(5).nullable().default(null),
});

export const MissedTaskOccurrenceResultSchema = z.object({
  kind: z.literal(TaskOccurrenceResultKind.Missed),
  recordedAt: z.number().int(),
  reason: z.string().max(2000).nullable().default(null),
});

export const SkippedTaskOccurrenceResultSchema = z.object({
  kind: z.literal(TaskOccurrenceResultKind.Skipped),
  recordedAt: z.number().int(),
  reason: z.string().max(2000).nullable().default(null),
});

export const TaskOccurrenceResultSchema = z.discriminatedUnion('kind', [
  CompletedTaskOccurrenceResultSchema,
  MissedTaskOccurrenceResultSchema,
  SkippedTaskOccurrenceResultSchema,
]);
export type TaskOccurrenceResult = z.infer<typeof TaskOccurrenceResultSchema>;
