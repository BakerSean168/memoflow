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
/** Irreversible or wide-blast-radius risks an operation can carry (#762). */
export const PermissionRiskSchema = z.enum(['delete_permanent', 'bulk', 'send_external']);
/** A single call affecting more objects than this is treated as bulk (#762). */
export const DEFAULT_BULK_THRESHOLD = 10;
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
    createdAt: z.number().int().nonnegative().optional(),
    expiresAt: z.number().int().nonnegative().optional(),
  })
  .strict();
export const PermissionSettingsSchema = z
  .object({
    preset: PermissionPresetSchema.default('confirm_each'),
    agentPresets: z.record(z.string(), PermissionPresetSchema).default({}),
    // Not every business object needs an override. Protected AI settings are never configurable.
    customMatrix: z
      .partialRecord(
        PermissionObjectSchema,
        z.partialRecord(PermissionActionSchema, PermissionEffectSchema),
      )
      .optional(),
    revision: z.number().int().positive().default(1),
    migratedFrom: z.string().optional(),
    /**
     * User-set bulk threshold (#762 phase 4): a write call affecting more
     * objects than this escalates to a fresh confirmation in every preset.
     * Optional in storage so settings written before this field existed stay
     * valid; evaluation resolves a missing value to DEFAULT_BULK_THRESHOLD.
     */
    bulkThreshold: z.number().int().min(1).max(1000).optional(),
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
    /** Objects the single call affected, when the caller declared a count (#762). */
    itemCount: z.number().int().nonnegative().optional(),
    /** Final evaluated risk set, including dynamically detected bulk (#762 phase 4). */
    risks: z.array(PermissionRiskSchema).optional(),
    execution: z.enum(['not_started', 'succeeded', 'failed']).default('not_started'),
  })
  .strict();

export type PermissionObject = z.infer<typeof PermissionObjectSchema>;
export type PermissionAction = z.infer<typeof PermissionActionSchema>;
export type PermissionEffect = z.infer<typeof PermissionEffectSchema>;
export type PermissionRisk = z.infer<typeof PermissionRiskSchema>;
export type PermissionPreset = z.infer<typeof PermissionPresetSchema>;
export type PermissionRule = z.infer<typeof PermissionRuleSchema>;
export type PermissionSettings = z.infer<typeof PermissionSettingsSchema>;
export type PermissionAuditRecord = z.infer<typeof PermissionAuditRecordSchema>;

/** User-only management commands; owner identity is supplied by authenticated transport. */
export const PermissionCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('snapshot') }).strict(),
  z
    .object({
      action: z.literal('settings'),
      settings: PermissionSettingsSchema,
    })
    .strict(),
  z.object({ action: z.literal('revoke'), ruleId: z.string().min(1) }).strict(),
  z
    .object({
      action: z.literal('conversation'),
      conversationId: z.string().min(1),
      preset: PermissionPresetSchema.nullable(),
    })
    .strict(),
]);
export const PermissionSnapshotSchema = z.object({
  settings: PermissionSettingsSchema,
  rules: z.array(PermissionRuleSchema),
  audit: z.array(PermissionAuditRecordSchema),
});
export type PermissionCommand = z.infer<typeof PermissionCommandSchema>;
export type PermissionSnapshot = z.infer<typeof PermissionSnapshotSchema>;
export const BusinessApprovalSchema = z
  .object({
    agentId: z.string().min(1),
    agentName: z.string().min(1).optional(),
    object: PermissionObjectSchema,
    action: PermissionActionSchema,
    expiresAt: z.number().int().nonnegative(),
  })
  .strict();
export type BusinessApproval = z.infer<typeof BusinessApprovalSchema>;
export type BusinessApprovalDecision =
  | 'approve_once'
  | 'approve_conversation'
  | 'approve_always'
  | 'decline';
