import { z } from 'zod';
import { CalendarEntryRangeSchema } from '@memoflow/schedule-contracts';

/**
 * Schedule writes reuse the Calendar entry contract's own range validator, so
 * the MCP edge and the owner reject the same malformed time spans. Receipts are
 * the minimal state projection: no identity, tenant link, audit trail or body.
 */
export const ScheduleWriteIdSchema = z.string().min(1).max(64);
const ScheduleAttendeesSchema = z.array(z.string().email()).max(100);
const ScheduleNameSchema = z.string().trim().min(1).max(200);
const ScheduleDescriptionSchema = z.string().max(2000);
const ScheduleLocationSchema = z.string().max(500);

export const ScheduleCreateInputSchema = z.strictObject({
  name: ScheduleNameSchema,
  range: CalendarEntryRangeSchema,
  description: ScheduleDescriptionSchema.optional(),
  location: ScheduleLocationSchema.optional(),
  attendees: ScheduleAttendeesSchema.optional(),
});
export type ScheduleCreateInput = z.infer<typeof ScheduleCreateInputSchema>;

/** Idempotent metadata patch: the time range moves only through `schedule_reschedule`. */
export const ScheduleUpdateInputSchema = z.strictObject({
  id: ScheduleWriteIdSchema,
  expectedVersion: z.number().int().positive(),
  changes: z
    .strictObject({
      name: ScheduleNameSchema.optional(),
      description: ScheduleDescriptionSchema.optional(),
      location: ScheduleLocationSchema.optional(),
      attendees: ScheduleAttendeesSchema.optional(),
    })
    .refine(
      (changes) => Object.values(changes).some((value) => value !== undefined),
      'Expected at least one metadata change; use schedule_reschedule for the time range',
    ),
});
export type ScheduleUpdateInput = z.infer<typeof ScheduleUpdateInputSchema>;

export const ScheduleRescheduleInputSchema = z.strictObject({
  id: ScheduleWriteIdSchema,
  expectedVersion: z.number().int().positive(),
  range: CalendarEntryRangeSchema,
});
export type ScheduleRescheduleInput = z.infer<typeof ScheduleRescheduleInputSchema>;

/** Permanent deletion of a Calendar entry; recoverability is not offered. */
export const ScheduleDeleteInputSchema = z.strictObject({
  id: ScheduleWriteIdSchema,
  expectedVersion: z.number().int().positive(),
});
export type ScheduleDeleteInput = z.infer<typeof ScheduleDeleteInputSchema>;

export const ScheduleWriteReceiptSchema = z.strictObject({
  id: ScheduleWriteIdSchema,
  version: z.number().int().positive(),
  updatedAt: z.number().int(),
});
export type ScheduleWriteReceipt = z.infer<typeof ScheduleWriteReceiptSchema>;

/** Reschedule echoes the accepted range so the caller can verify the new time. */
export const ScheduleRescheduleReceiptSchema = ScheduleWriteReceiptSchema.extend({
  range: CalendarEntryRangeSchema,
});
export type ScheduleRescheduleReceipt = z.infer<typeof ScheduleRescheduleReceiptSchema>;

export const ScheduleDeleteReceiptSchema = z.strictObject({
  id: ScheduleWriteIdSchema,
  deleted: z.literal(true),
});
export type ScheduleDeleteReceipt = z.infer<typeof ScheduleDeleteReceiptSchema>;
