import { z } from 'zod';

/** Product-owned attention metadata, not the authoritative Agent transcript. */
export const AssistantAttentionStateSchema = z.enum([
  'normal',
  'working',
  'input',
  'approval',
  'failed',
  'done',
]);
export const AssistantAttentionRuntimeKindSchema = z.enum(['builtin', 'local_agent']);
export const AssistantAttentionListRequestSchema = z
  .object({
    runtimeKind: AssistantAttentionRuntimeKindSchema.default('builtin'),
    conversationIds: z.array(z.string().trim().min(1).max(256)).max(100),
  })
  .strict();
export const AssistantAttentionAckRequestSchema = z
  .object({
    runtimeKind: AssistantAttentionRuntimeKindSchema.default('builtin'),
    conversationId: z.string().trim().min(1).max(256),
    revision: z.number().int().positive(),
  })
  .strict();
export const AssistantAttentionViewSchema = z
  .object({
    conversationId: z.string().min(1),
    runtimeKind: AssistantAttentionRuntimeKindSchema,
    state: AssistantAttentionStateSchema,
    revision: z.number().int().positive(),
    seenRevision: z.number().int().nonnegative(),
    runId: z.string().nullable(),
    updatedAt: z.number().int().nonnegative(),
    /** Event ordering version, independent of the revision acknowledged by the user. */
    resourceVersion: z.number().int().positive().optional(),
  })
  .strict();
export const AssistantAttentionListResponseSchema = z
  .object({
    items: z.array(AssistantAttentionViewSchema).max(100),
  })
  .strict();
export const AssistantAttentionAckResponseSchema = z.object({ acknowledged: z.boolean() }).strict();

export type AssistantAttentionState = z.infer<typeof AssistantAttentionStateSchema>;
export type AssistantAttentionRuntimeKind = z.infer<typeof AssistantAttentionRuntimeKindSchema>;
export type AssistantAttentionView = z.infer<typeof AssistantAttentionViewSchema>;
export type AssistantAttentionListRequest = z.infer<typeof AssistantAttentionListRequestSchema>;
export type AssistantAttentionAckRequest = z.infer<typeof AssistantAttentionAckRequestSchema>;
