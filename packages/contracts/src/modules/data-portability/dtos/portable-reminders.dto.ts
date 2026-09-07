/**
 * Portable Reminders DTOs
 */

import { z } from 'zod';
import { PortableRefSchema, IsoDateString } from './portable-common.dto';

export const PortableReminderGroupSchema = z
  .object({
    _ref: PortableRefSchema,
    name: z.string(),
    description: z.string().nullable().optional(),
    enabled: z.boolean(),
    status: z.string(),
    order: z.number(),
    color: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    createdAt: IsoDateString.optional(),
    updatedAt: IsoDateString.optional(),
  })
  .strict();

export type PortableReminderGroup = z.infer<typeof PortableReminderGroupSchema>;

export const PortableReminderTemplateSchema = z
  .object({
    _ref: PortableRefSchema,
    title: z.string(),
    description: z.string().nullable().optional(),
    type: z.string(),
    trigger: z.unknown(),
    activeTime: z.unknown(),
    activeHours: z.unknown().optional(),
    notificationConfig: z.unknown(),
    selfEnabled: z.boolean(),
    status: z.string(),
    routineDefinition: z.object({
      enabled: z.boolean(),
      trigger: z.unknown().nullable(),
    }),
    profileMemberships: z.array(
      z.object({
        profileRef: PortableRefSchema,
        enabled: z.boolean(),
      }),
    ),
    importanceLevel: z.string(),
    tags: z.array(z.string()),
    color: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    smartFrequencyEnabled: z.boolean(),
    createdAt: IsoDateString.optional(),
    updatedAt: IsoDateString.optional(),
  })
  .strict();

export type PortableReminderTemplate = z.infer<typeof PortableReminderTemplateSchema>;

export const PortableReminderResponseSchema = z
  .object({
    _ref: PortableRefSchema,
    templateRef: PortableRefSchema,
    action: z.string(),
    responseTime: IsoDateString.nullable().optional(),
    timestamp: IsoDateString,
  })
  .strict();

export type PortableReminderResponse = z.infer<typeof PortableReminderResponseSchema>;

export const PortableReminderDataSchema = z
  .object({
    groups: z.array(PortableReminderGroupSchema),
    templates: z.array(PortableReminderTemplateSchema),
    responses: z.array(PortableReminderResponseSchema),
  })
  .strict();

export type PortableReminderData = z.infer<typeof PortableReminderDataSchema>;
