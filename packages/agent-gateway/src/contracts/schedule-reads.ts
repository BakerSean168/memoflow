import { z } from 'zod';
import { CalendarEntryRangeSchema } from '@memoflow/schedule-contracts';

/** External Schedule reads expose calendar entries without internal audit or tenant links. */
export const ExternalScheduleSchema = z.strictObject({
  id: z.string().min(1).max(64),
  title: z.string(),
  description: z.string().optional(),
  range: CalendarEntryRangeSchema,
  location: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  version: z.number().int().positive(),
  createdAt: z.union([z.string(), z.number()]),
  updatedAt: z.union([z.string(), z.number()]),
});
export type ExternalSchedule = z.infer<typeof ExternalScheduleSchema>;

export const ScheduleGetInputSchema = z.strictObject({
  id: z.string().min(1).max(64),
});
export const ScheduleGetOutputSchema = z.strictObject({
  schedule: ExternalScheduleSchema,
});

export const ScheduleListInputSchema = z
  .strictObject({
    startTime: z.number().int().nonnegative(),
    endTime: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().max(2048).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.endTime < input.startTime || input.endTime - input.startTime > 90 * 86400000) {
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'Expected an ordered range of at most 90 days',
      });
    }
  });
export const ScheduleListOutputSchema = z.strictObject({
  items: z.array(ExternalScheduleSchema).max(100),
  hasMore: z.boolean(),
  nextCursor: z.string().max(2048).nullable(),
  truncated: z.literal('response-budget').optional(),
});
