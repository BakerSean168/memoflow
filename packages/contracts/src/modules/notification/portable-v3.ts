import { z } from 'zod';
import { PortableReferenceV3Schema } from '../data-portability/dtos/portable-v3.dto';
import { ImportanceLevel } from '../../shared/value-objects/importance';
import { UrgencyLevel } from '../../shared/value-objects/urgency';
import { NotificationCategory } from './value-objects/notification-category';
import { NotificationType } from './value-objects/notification-type';
import { NotificationActionIntentSchema, NotificationNavigationIntentSchema } from './api/notification-action.dto';

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

const NotificationPortableReferenceV3Schema = PortableReferenceV3Schema.refine(
  (ref) => ref.startsWith('notifications:'),
  'Notification portable references must use the notifications capability',
);

const PortableInstantSchema = z.number().int().nonnegative();

/** Presentation hints that are safe to carry with a user-visible Fact. */
const NotificationPortablePresentationV3Schema = z
  .object({
    icon: z.string().nullable(),
    image: z.string().nullable(),
    color: z.string().nullable(),
  })
  .strict();

export const NotificationPortableFactV3Schema = z
  .object({
    ref: NotificationPortableReferenceV3Schema,
    workflowKey: z.string().trim().min(1).max(200),
    topic: z.string().trim().min(1).max(200),
    title: z.string().max(1000),
    content: z.string().max(10000),
    type: z.enum(NotificationType),
    category: z.enum(NotificationCategory),
    importance: z.enum(ImportanceLevel),
    urgency: z.enum(UrgencyLevel),
    relatedEntityType: z.string().trim().min(1).max(120).nullable(),
    relatedEntityId: z.string().trim().min(1).max(500).nullable(),
    navigationIntent: NotificationNavigationIntentSchema.nullable(),
    actions: z.array(NotificationActionIntentSchema).nullable(),
    presentation: NotificationPortablePresentationV3Schema.nullable(),
    correlationId: z.string().nullable(),
    causationId: z.string().nullable(),
    readAt: PortableInstantSchema.nullable(),
    archivedAt: PortableInstantSchema.nullable(),
    expiresAt: PortableInstantSchema.nullable(),
  })
  .strict()
  .superRefine((fact, ctx) => {
    const actionKeys = new Set<string>();
    for (const [index, action] of (fact.actions ?? []).entries()) {
      if (actionKeys.has(action.actionKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['actions', index, 'actionKey'],
          message: `Duplicate Notification action key: ${action.actionKey}`,
        });
      }
      actionKeys.add(action.actionKey);
    }
  });

export type NotificationPortableFactV3 = z.infer<typeof NotificationPortableFactV3Schema>;

export const NotificationPortableInteractionV3Schema = z
  .object({
    ref: NotificationPortableReferenceV3Schema,
    notificationRef: NotificationPortableReferenceV3Schema,
    actionKey: z.string().trim().min(1).max(200),
    actionKind: z.enum(['navigate', 'owner-command', 'archive']),
    occurredAt: PortableInstantSchema,
    commandReceiptId: z.string().nullable(),
    outcome: z.enum(['accepted', 'rejected', 'failed']),
    correlationId: z.string().nullable(),
    causationId: z.string().nullable(),
  })
  .strict();

export type NotificationPortableInteractionV3 = z.infer<
  typeof NotificationPortableInteractionV3Schema
>;

/** Durable Notification Fact/Inbox and typed Interaction payload. */
export const NotificationPortablePayloadV3Schema = z
  .object({
    facts: z.array(NotificationPortableFactV3Schema),
    interactions: z.array(NotificationPortableInteractionV3Schema),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const refs = new Set<string>();
    for (const [index, fact] of payload.facts.entries()) {
      if (refs.has(fact.ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['facts', index, 'ref'],
          message: `Duplicate portable Notification reference: ${fact.ref}`,
        });
      }
      refs.add(fact.ref);
    }
    for (const [index, interaction] of payload.interactions.entries()) {
      if (refs.has(interaction.ref)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['interactions', index, 'ref'],
          message: `Duplicate portable Notification entity reference: ${interaction.ref}`,
        });
      }
      refs.add(interaction.ref);
      if (!payload.facts.some((fact) => fact.ref === interaction.notificationRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['interactions', index, 'notificationRef'],
          message: `Notification interaction references an unknown Fact: ${interaction.notificationRef}`,
        });
      }
    }
  });

export type NotificationPortablePayloadV3 = z.infer<typeof NotificationPortablePayloadV3Schema>;
