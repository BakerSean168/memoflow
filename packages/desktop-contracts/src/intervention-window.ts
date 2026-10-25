import { z } from 'zod';

export type InterventionWindowState = 'Gentle' | 'Grace' | 'Guided';

export interface InterventionWindowProjection {
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly state: InterventionWindowState;
  readonly version: number;
  readonly dueAt: number;
  readonly phaseEnteredAt: number;
  readonly phaseDeadline: number | null;
  readonly remainingMs: number | null;
}

export const InterventionWindowCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('complete') }).strict(),
  z
    .object({
      action: z.literal('snooze'),
      durationMs: z.number().finite().positive(),
    })
    .strict(),
  z.object({ action: z.literal('dismiss') }).strict(),
]);

export type InterventionWindowCommand = z.infer<typeof InterventionWindowCommandSchema>;
