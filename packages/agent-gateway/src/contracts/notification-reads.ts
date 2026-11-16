import { z } from 'zod';
import { ExternalNotificationSchema } from './notifications';

/** Single Notification fact read; the canonical fact projection is reused. */
export const NotificationGetInputSchema = z.strictObject({
  id: z.string().min(1).max(100),
});
export const NotificationGetOutputSchema = z.strictObject({
  notification: ExternalNotificationSchema,
});
