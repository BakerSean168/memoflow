import { z } from 'zod';
import { PortableReferenceV3Schema } from '../data-portability/dtos/portable-v3.dto';
import { CalendarEntryRangeSchema } from './calendar-entry-range';

const SchedulePortableReferenceV3Schema = PortableReferenceV3Schema.refine(
  (ref) => ref.startsWith('schedules:'),
  'Schedule portable references must use the schedules capability',
);

/** Owner-owned canonical CalendarEntry payload for the `schedules@3` capability. */
export const SchedulePortableEntryV3Schema = z
  .object({
    ref: SchedulePortableReferenceV3Schema,
    title: z.string().trim().min(1).max(500),
    description: z.string().nullable(),
    range: CalendarEntryRangeSchema,
    location: z.string().nullable(),
    attendees: z.array(z.string().trim().min(1).max(500)).nullable(),
  })
  .strict();

export type SchedulePortableEntryV3 = z.infer<typeof SchedulePortableEntryV3Schema>;

export const SchedulePortablePayloadV3Schema = z
  .object({ entries: z.array(SchedulePortableEntryV3Schema) })
  .strict()
  .superRefine((payload, ctx) => {
    const refs = new Set<string>();
    for (const [index, entry] of payload.entries.entries()) {
      if (refs.has(entry.ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['entries', index, 'ref'],
          message: `Duplicate portable schedule reference: ${entry.ref}`,
        });
      }
      refs.add(entry.ref);
    }
  });

export type SchedulePortablePayloadV3 = z.infer<typeof SchedulePortablePayloadV3Schema>;
