import { z } from 'zod';
import {
  KeyResultCalculationMethod,
  GoalStatus,
  GoalTimeframeSchema,
} from '../../goal';

export const GoalPanelStatusSchema = z.enum(GoalStatus);
export type GoalPanelStatus = z.infer<typeof GoalPanelStatusSchema>;

export const GoalPanelActionSchema = z.enum([
  'open',
  'patch',
  'add_key_result',
  'remove_key_result',
  'focus',
  'submit',
  'cancel',
  'release',
]);
export type GoalPanelAction = z.infer<typeof GoalPanelActionSchema>;

export const GoalPanelKeyResultDraftSchema = z
  .object({
    index: z.number().int().nonnegative().optional(),
    id: z.string().optional(),
    title: z.string().max(80),
    description: z.string().max(500).optional(),
    calculationMethod: z.enum(KeyResultCalculationMethod).optional(),
    initialValue: z.number().optional(),
    currentValue: z.number().optional(),
    targetValue: z.number().optional(),
    unit: z.string().max(20).optional(),
    weight: z.number().min(0).max(100).optional(),
  })
  .strict();
export type GoalPanelKeyResultDraft = z.infer<typeof GoalPanelKeyResultDraftSchema>;

export const GoalPanelFieldsSchema = z
  .object({
    name: z.string().max(80),
    summary: z.string().max(255).optional(),
    description: z.string().max(4000).optional(),
    status: GoalPanelStatusSchema,
    start: GoalTimeframeSchema.nullable().optional(),
    target: GoalTimeframeSchema.nullable().optional(),
    labelIds: z.array(z.string()).default([]),
  })
  .strict();
export type GoalPanelFields = z.infer<typeof GoalPanelFieldsSchema>;

export const GoalPanelSnapshotSchema = z
  .object({
    activeModule: z.string().nullable(),
    activeTabRoute: z.string().nullable(),
    panelSurface: z.enum(['home', 'business']),
    formOpen: z.boolean(),
    mode: z.enum(['create', 'edit']).nullable().optional(),
    goalId: z.string().nullable().optional(),
    revision: z.number().int().nonnegative().optional(),
    dirty: z.boolean(),
    busy: z.boolean(),
    error: z.string().nullable().optional(),
    isControlled: z.boolean(),
    controlledByMe: z.boolean(),
    fields: GoalPanelFieldsSchema.optional(),
    keyResults: z.array(GoalPanelKeyResultDraftSchema).optional(),
    allowedActions: z.array(GoalPanelActionSchema),
  })
  .strict();
export type GoalPanelSnapshot = z.infer<typeof GoalPanelSnapshotSchema>;

export const GoalPanelSnapshotCommandSchema = z
  .object({
    action: z.literal('snapshot'),
  })
  .strict();

export const GoalPanelOpenCommandSchema = z
  .object({
    action: z.literal('open'),
    mode: z.enum(['create', 'edit']).default('create'),
    goalId: z.string().optional(),
  })
  .strict();

export const GoalPanelPatchCommandSchema = z
  .object({
    action: z.literal('patch'),
    expectedRevision: z.number().int().nonnegative().optional(),
    name: z.string().max(80).optional(),
    summary: z.string().max(255).optional(),
    description: z.string().max(4000).optional(),
    status: GoalPanelStatusSchema.optional(),
    start: GoalTimeframeSchema.nullable().optional(),
    target: GoalTimeframeSchema.nullable().optional(),
    labelIds: z.array(z.string()).optional(),
    keyResults: z.array(GoalPanelKeyResultDraftSchema).optional(),
    keyResult: z
      .object({
        index: z.number().int().nonnegative(),
        changes: GoalPanelKeyResultDraftSchema.partial(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const GoalPanelAddKeyResultCommandSchema = z
  .object({
    action: z.literal('add_key_result'),
    expectedRevision: z.number().int().nonnegative().optional(),
    keyResult: GoalPanelKeyResultDraftSchema,
  })
  .strict();

export const GoalPanelRemoveKeyResultCommandSchema = z
  .object({
    action: z.literal('remove_key_result'),
    expectedRevision: z.number().int().nonnegative().optional(),
    index: z.number().int().nonnegative(),
  })
  .strict();

export const GoalPanelFocusCommandSchema = z
  .object({
    action: z.literal('focus'),
    field: z.enum(['name', 'summary', 'description']),
  })
  .strict();

export const GoalPanelSubmitCommandSchema = z
  .object({
    action: z.literal('submit'),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();

export const GoalPanelReleaseCommandSchema = z
  .object({
    action: z.literal('release'),
  })
  .strict();

export const GoalPanelCommandSchema = z.discriminatedUnion('action', [
  GoalPanelSnapshotCommandSchema,
  GoalPanelOpenCommandSchema,
  GoalPanelPatchCommandSchema,
  GoalPanelAddKeyResultCommandSchema,
  GoalPanelRemoveKeyResultCommandSchema,
  GoalPanelFocusCommandSchema,
  GoalPanelSubmitCommandSchema,
  GoalPanelReleaseCommandSchema,
]);
export type GoalPanelCommand = z.infer<typeof GoalPanelCommandSchema>;

export const GoalPanelSubmitResultSchema = z
  .object({
    success: z.boolean(),
    goalId: z.string(),
    goalUrl: z.string(),
    name: z.string(),
    version: z.number().int().nonnegative(),
    status: GoalPanelStatusSchema,
  })
  .strict();
export type GoalPanelSubmitResult = z.infer<typeof GoalPanelSubmitResultSchema>;

export const NativePanelIpcRequestSchema = z
  .object({
    requestId: z.string().min(1),
    identityId: z.string().min(1),
    conversationId: z.string().min(1),
    runId: z.string().min(1),
    command: GoalPanelCommandSchema,
  })
  .strict();
export type NativePanelIpcRequest = z.infer<typeof NativePanelIpcRequestSchema>;

export const NativePanelIpcResponseSchema = z
  .object({
    requestId: z.string().min(1),
    ok: z.boolean(),
    snapshot: GoalPanelSnapshotSchema.optional(),
    submitResult: GoalPanelSubmitResultSchema.optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type NativePanelIpcResponse = z.infer<typeof NativePanelIpcResponseSchema>;
