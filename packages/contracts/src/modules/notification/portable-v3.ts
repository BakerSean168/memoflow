import { z } from 'zod';

/**
 * Stable, user-owned notification delivery choices portable across hosts.
 *
 * Device presentation/sound, identity, persistence metadata, legacy DND and
 * rate-limit fields are intentionally outside this payload. QuietHours and
 * system delivery guards will be registered only after ADR-088 final cutover.
 */
export const NotificationDeliveryChannelFlagsV3Schema = z
  .object({
    InApp: z.boolean().optional(),
    Email: z.boolean().optional(),
    Push: z.boolean().optional(),
    Desktop: z.boolean().optional(),
    Sms: z.boolean().optional(),
    Webhook: z.boolean().optional(),
  })
  .strict();

export const NotificationDeliveryPreferencePortablePayloadV3Schema = z
  .object({
    globalChannels: NotificationDeliveryChannelFlagsV3Schema,
    workflowOverrides: z.record(z.string().min(1), NotificationDeliveryChannelFlagsV3Schema),
  })
  .strict();

export type NotificationDeliveryPreferencePortablePayloadV3 = z.infer<
  typeof NotificationDeliveryPreferencePortablePayloadV3Schema
>;
