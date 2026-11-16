import { z } from 'zod';
import {
  RoutineDefinitionSchema,
  RoutineUpcomingOccurrenceSchema,
} from '@memoflow/routine-contracts';

/** External Routine reads expose the definition but never another owner's identity. */
export const ExternalRoutineSchema = RoutineDefinitionSchema.strict();
export const ExternalRoutineOccurrenceSchema = RoutineUpcomingOccurrenceSchema.omit({
  identityId: true,
}).strict();

export const RoutineGetInputSchema = z.strictObject({
  id: z.uuid(),
});
export const RoutineGetOutputSchema = z.strictObject({
  routine: ExternalRoutineSchema,
});

export const RoutineListInputSchema = z.strictObject({
  query: z.string().trim().max(200).default(''),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().max(2048).optional(),
});
export const RoutineListOutputSchema = z.strictObject({
  items: z.array(ExternalRoutineSchema).max(50),
  hasMore: z.boolean(),
  nextCursor: z.string().max(2048).nullable(),
  truncated: z.literal('response-budget').optional(),
});

/** Upcoming occurrences share the Task read window bound: at most 31 days. */
export const RoutineUpcomingInputSchema = z
  .strictObject({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    includeElapsed: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(20),
    cursor: z.string().max(2048).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.end < input.start || input.end - input.start > 31 * 86400000)
      ctx.addIssue({
        code: 'custom',
        path: ['end'],
        message: 'Expected an ordered range of at most 31 days',
      });
  });
export const RoutineUpcomingOutputSchema = z.strictObject({
  items: z.array(ExternalRoutineOccurrenceSchema).max(100),
  hasMore: z.boolean(),
  nextCursor: z.string().max(2048).nullable(),
  truncated: z.literal('response-budget').optional(),
});
