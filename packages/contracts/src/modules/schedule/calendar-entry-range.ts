import { z } from 'zod';
import type { Instant, Ymd } from '../../primitives';
import { YmdSchema } from '../../primitives';

/**
 * Canonical CalendarEntry time truth (ADR-080).
 *
 * Timed entries live on the Instant timeline. All-day entries stay as calendar
 * dates and must never be encoded as synthetic UTC/local midnight instants.
 */
export type CalendarEntryRange =
  | {
      readonly kind: 'Timed';
      readonly start: Instant;
      readonly end: Instant;
    }
  | {
      readonly kind: 'AllDay';
      readonly start: Ymd;
      readonly end: Ymd | null;
    };

export const CalendarEntryRangeSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('Timed'),
      start: z.number().finite(),
      end: z.number().finite(),
    }),
    z.object({
      kind: z.literal('AllDay'),
      start: YmdSchema,
      end: YmdSchema.nullable(),
    }),
  ])
  .superRefine((range, ctx) => {
    if (range.kind === 'Timed') {
      if (range.start >= range.end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['end'],
          message: 'Timed CalendarEntry range requires start < end',
        });
      }
      return;
    }

    if (range.end != null && range.start > range.end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end'],
        message: 'AllDay CalendarEntry range requires start <= end',
      });
    }
  }) as z.ZodType<CalendarEntryRange>;

export function cloneCalendarEntryRange(range: CalendarEntryRange): CalendarEntryRange {
  return range.kind === 'Timed'
    ? { kind: 'Timed', start: range.start, end: range.end }
    : { kind: 'AllDay', start: range.start, end: range.end };
}
