import { z } from 'zod';
import type { Hm, Ymd } from '../../../primitives';
import { DayOfWeek } from './day-of-week';
import { RecurrenceFrequency } from './recurrence-frequency';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const TaskYmdSchema = z.custom<Ymd>(
  (value) => typeof value === 'string' && YMD_RE.test(value),
  'Expected calendar date in YYYY-MM-DD form',
);

export const TaskHmSchema = z.custom<Hm>(
  (value) => typeof value === 'string' && HM_RE.test(value),
  'Expected local clock time in HH:mm form',
);

export const TaskTimingKind = {
  AllDay: 'AllDay',
  At: 'At',
  Window: 'Window',
} as const;
export type TaskTimingKind = (typeof TaskTimingKind)[keyof typeof TaskTimingKind];

const AllDayTaskTimingSchema = z.object({
  kind: z.literal(TaskTimingKind.AllDay),
});

const AtTaskTimingSchema = z.object({
  kind: z.literal(TaskTimingKind.At),
  time: TaskHmSchema,
});

const WindowTaskTimingSchema = z
  .object({
    kind: z.literal(TaskTimingKind.Window),
    start: TaskHmSchema,
    end: TaskHmSchema,
  })
  .superRefine((value, ctx) => {
    if (value.start >= value.end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end'],
        message: 'Task timing window end must be after start',
      });
    }
  });

export const TaskTimingSchema = z.union([
  AllDayTaskTimingSchema,
  AtTaskTimingSchema,
  WindowTaskTimingSchema,
]);
export type TaskTiming = z.infer<typeof TaskTimingSchema>;

export const TaskRecurrenceEndKind = {
  Never: 'Never',
  Until: 'Until',
  Count: 'Count',
} as const;
export type TaskRecurrenceEndKind =
  (typeof TaskRecurrenceEndKind)[keyof typeof TaskRecurrenceEndKind];

export const TaskRecurrenceEndSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal(TaskRecurrenceEndKind.Never) }),
  z.object({ kind: z.literal(TaskRecurrenceEndKind.Until), date: TaskYmdSchema }),
  z.object({ kind: z.literal(TaskRecurrenceEndKind.Count), count: z.number().int().positive() }),
]);
export type TaskRecurrenceEnd = z.infer<typeof TaskRecurrenceEndSchema>;

export const TaskRecurrenceSchema = z
  .object({
    frequency: z.enum(RecurrenceFrequency),
    interval: z.number().int().min(1).max(365).default(1),
    byWeekday: z.array(z.enum(DayOfWeek)).default([]),
    end: TaskRecurrenceEndSchema,
  })
  .superRefine((value, ctx) => {
    if (value.frequency === RecurrenceFrequency.Weekly && value.byWeekday.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['byWeekday'],
        message: 'Weekly recurrence requires at least one weekday',
      });
    }
    if (value.frequency !== RecurrenceFrequency.Weekly && value.byWeekday.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['byWeekday'],
        message: 'byWeekday is only valid for weekly recurrence',
      });
    }
  });
export type TaskRecurrence = z.infer<typeof TaskRecurrenceSchema>;

export const TaskPlanScheduleKind = {
  OneTime: 'OneTime',
  Recurring: 'Recurring',
} as const;
export type TaskPlanScheduleKind = (typeof TaskPlanScheduleKind)[keyof typeof TaskPlanScheduleKind];

export const OneTimeTaskPlanScheduleSchema = z.object({
  kind: z.literal(TaskPlanScheduleKind.OneTime),
  date: TaskYmdSchema,
  timing: TaskTimingSchema,
});
export type OneTimeTaskPlanSchedule = z.infer<typeof OneTimeTaskPlanScheduleSchema>;

export const RecurringTaskPlanScheduleSchema = z.object({
  kind: z.literal(TaskPlanScheduleKind.Recurring),
  startDate: TaskYmdSchema,
  timing: TaskTimingSchema,
  recurrence: TaskRecurrenceSchema,
});
export type RecurringTaskPlanSchedule = z.infer<typeof RecurringTaskPlanScheduleSchema>;

export const TaskPlanScheduleSchema = z.discriminatedUnion('kind', [
  OneTimeTaskPlanScheduleSchema,
  RecurringTaskPlanScheduleSchema,
]);
export type TaskPlanSchedule = z.infer<typeof TaskPlanScheduleSchema>;
