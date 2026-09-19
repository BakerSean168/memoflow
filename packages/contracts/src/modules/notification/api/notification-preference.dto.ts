import { z } from 'zod';
import type { NotificationPreferenceServerDTO } from '../aggregates/notification-preference-server';
import type { NotificationStatsDTO } from '../dtos/notification-result.dto';
import { TimeZoneIdSchema } from '../../../primitives';

const ChannelPreferenceFlagsSchema = z.object({
  InApp: z.boolean().optional(),
  Email: z.boolean().optional(),
  Push: z.boolean().optional(),
  Desktop: z.boolean().optional(),
  Sms: z.boolean().optional(),
  Webhook: z.boolean().optional(),
});

const HmSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/);
const WeekdaySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const QuietHoursSchema = z.object({
  enabled: z.boolean(),
  timeZone: TimeZoneIdSchema,
  weeklyWindows: z.array(
    z.object({
      daysOfWeek: z.array(WeekdaySchema).min(1),
      start: HmSchema,
      end: HmSchema,
    }).refine((value) => value.start !== value.end, {
      message: 'QuietHours window start and end must differ',
    }),
  ),
});

/** User-owned layers only. System rate/burst guards are deliberately absent. */
export const UpdateNotificationPreferenceSchema = z.object({
  globalChannels: ChannelPreferenceFlagsSchema.optional(),
  workflowOverrides: z.record(z.string(), ChannelPreferenceFlagsSchema).optional(),
  quietHours: QuietHoursSchema.nullable().optional(),
});

export type UpdateNotificationPreferenceReq = z.infer<typeof UpdateNotificationPreferenceSchema>;
export type UpdateNotificationPreferenceRes = NotificationPreferenceServerDTO;
export type GetNotificationPreferenceReq = void;
export type GetNotificationPreferenceRes = NotificationPreferenceServerDTO;
export type GetNotificationStatsReq = void;
export type GetNotificationStatsRes = NotificationStatsDTO;
