import { z } from 'zod';

export const PermissionObjectSchema = z.enum([
  'goal',
  'key_result',
  'task',
  'routine',
  'knowledge',
  'notification',
  'ai_permission',
]);
export const PermissionActionSchema = z.enum(['read', 'create', 'update', 'delete']);
export const PermissionEffectSchema = z.enum(['allow', 'ask', 'deny']);
export const PermissionPresetSchema = z.enum([
  'read_only',
  'confirm_each',
  'on_demand',
  'full_auto',
  'custom',
]);
export const PermissionRuleSchema = z
  .object({
    id: z.string().min(1),
    agentId: z.string().min(1).nullable(),
    object: PermissionObjectSchema,
    action: PermissionActionSchema,
    effect: PermissionEffectSchema,
    source: z.enum(['user', 'migration']),
    expiresAt: z.number().int().nonnegative().optional(),
  })
  .strict();
export const PermissionSettingsSchema = z
  .object({
    preset: PermissionPresetSchema.default('on_demand'),
    agentPresets: z.record(z.string(), PermissionPresetSchema).default({}),
    customMatrix: z
      .record(PermissionObjectSchema, z.record(PermissionActionSchema, PermissionEffectSchema))
      .optional(),
    revision: z.number().int().positive().default(1),
    migratedFrom: z.string().optional(),
  })
  .strict();
export const PermissionAuditRecordSchema = z
  .object({
    id: z.string().min(1),
    occurredAt: z.number().int().nonnegative(),
    agentId: z.string().min(1),
    conversationId: z.string().min(1).nullable(),
    operationId: z.string().min(1),
    object: PermissionObjectSchema.nullable(),
    action: PermissionActionSchema.nullable(),
    decision: PermissionEffectSchema,
    decidedBy: z.enum(['rule', 'user', 'timeout', 'preset', 'system']),
    ruleId: z.string().nullable(),
    execution: z.enum(['not_started', 'succeeded', 'failed']).default('not_started'),
  })
  .strict();

export type PermissionObject = z.infer<typeof PermissionObjectSchema>;
export type PermissionAction = z.infer<typeof PermissionActionSchema>;
export type PermissionEffect = z.infer<typeof PermissionEffectSchema>;
export type PermissionPreset = z.infer<typeof PermissionPresetSchema>;
export type PermissionRule = z.infer<typeof PermissionRuleSchema>;
export type PermissionSettings = z.infer<typeof PermissionSettingsSchema>;
export type PermissionAuditRecord = z.infer<typeof PermissionAuditRecordSchema>;
