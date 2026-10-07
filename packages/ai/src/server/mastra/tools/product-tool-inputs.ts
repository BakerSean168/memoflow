import { z } from 'zod';
import { TimeZoneIdSchema, YmdSchema } from '@memoflow/contracts/primitives';
const instantSchema = z.number().int().nonnegative();
const hmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const weekdaySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
const routineTriggerRecurrenceSchema = z
  .strictObject({
    startDate: YmdSchema,
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    interval: z.number().int().positive().default(1),
    byWeekday: z.array(weekdaySchema).default([]),
    count: z.number().int().positive().nullable().default(null),
    until: instantSchema.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.frequency === 'weekly' && value.byWeekday.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['byWeekday'],
        message: 'Weekly WallClock recurrence requires at least one weekday',
      });
    }
  });

export const RoutineTriggerSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('WallClock'),
    timingOwner: z.literal('scheduler'),
    localTime: hmSchema,
    timeZone: TimeZoneIdSchema,
    recurrence: routineTriggerRecurrenceSchema,
  }),
  z.strictObject({
    type: z.literal('Elapsed'),
    timingOwner: z.literal('local-runtime'),
    durationMs: z.number().finite().positive(),
    anchor: z
      .enum(['routine-activation', 'profile-activation', 'last-satisfied'])
      .default('last-satisfied'),
  }),
  z.strictObject({
    type: z.literal('ActiveUsage'),
    timingOwner: z.literal('local-runtime'),
    requiredActiveMs: z.number().finite().positive(),
    anchor: z.enum(['profile-activation', 'last-satisfied']).default('last-satisfied'),
    naturalBreakCredit: z
      .strictObject({
        idleDurationMs: z.number().finite().positive(),
        effect: z.literal('satisfy-and-reset').default('satisfy-and-reset'),
      })
      .nullable()
      .default(null),
    protocolBreakCredit: z
      .strictObject({
        kind: z.enum(['Stand', 'Eye', 'Movement']),
        minimumBreakMs: z.number().finite().positive(),
      })
      .nullable()
      .default(null),
  }),
]);

export const windowSchema = z.strictObject({
  range: z
    .strictObject({
      start: instantSchema,
      end: instantSchema,
    })
    .refine((value) => value.end > value.start, {
      message: 'Planner range end must be greater than start',
    }),
});
