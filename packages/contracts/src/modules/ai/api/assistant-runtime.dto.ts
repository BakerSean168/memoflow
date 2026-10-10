import { z } from 'zod';
import {
  AssistantRuntimeKindSchema,
  LocalAgentActivitySchema,
  AgentInstanceSlugSchema,
} from './local-agent.dto';
/**
 * MemoFlow AI vNext cross-boundary contracts.
 *
 * These schemas intentionally do not expose Mastra private event/snapshot types.
 * The host owns authentication and injects identity from ExecutionContext; any
 * client payload that attempts to smuggle identityId is rejected.
 */

export const AIRuntimeSurfaceSchema = z.enum(['web', 'desktop', 'mobile', 'server']);
export type AIRuntimeSurface = z.infer<typeof AIRuntimeSurfaceSchema>;

const ASSISTANT_RUNTIME_ATTACHMENT_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
]);

export const AssistantRuntimeAttachmentSchema = z
  .object({
    data: z
      .string()
      .min(1)
      .max(1_500_000)
      .regex(/^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/iu),
    mediaType: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/iu),
    filename: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .superRefine((attachment, context) => {
    if (!ASSISTANT_RUNTIME_ATTACHMENT_MEDIA_TYPES.has(attachment.mediaType.toLowerCase())) {
      context.addIssue({
        code: 'custom',
        path: ['mediaType'],
        message: 'Unsupported assistant attachment media type',
      });
    }
    const prefix = `data:${attachment.mediaType};base64,`.toLowerCase();
    if (!attachment.data.toLowerCase().startsWith(prefix)) {
      context.addIssue({
        code: 'custom',
        path: ['data'],
        message: 'Attachment data media type must match mediaType',
      });
    }
  });
export type AssistantRuntimeAttachment = z.infer<typeof AssistantRuntimeAttachmentSchema>;

export const AssistantRuntimeSelectedEntitySchema = z
  .object({
    entityType: z.enum(['goal', 'task', 'knowledge_document']),
    id: z.string().trim().min(1).max(512),
    label: z.string().trim().min(1).max(240).optional(),
  })
  .strict();
export type AssistantRuntimeSelectedEntity = z.infer<typeof AssistantRuntimeSelectedEntitySchema>;

export const AssistantToolNameSchema = z.enum([
  'knowledge_search',
  'workspace_overview',
  'planner_today_summary',
  'planner_conflicts',
  'planner_upcoming_tasks',
  'notification_unread_summary',
  'routine_create',
  'routine_set_profile_active',
  'routine_set_temporary_override',
  'routine_clear_temporary_override',
  'routine_start_protocol',
  'notification_execute_action',
  'routine_pause_protocol',
  'routine_resume_protocol',
  'routine_end_protocol',
]);
export type AssistantToolName = z.infer<typeof AssistantToolNameSchema>;

export const AssistantRuntimeApprovalCommandSchema = z
  .object({
    type: z.literal('tool_approval'),
    conversationId: z.string().min(1).max(512),
    runId: z.string().min(1).max(512),
    toolCallId: z.string().min(1).max(512),
    decision: z.enum(['approve', 'decline']),
    identityId: z.never().optional(),
  })
  .strict();
export type AssistantRuntimeApprovalCommand = z.infer<typeof AssistantRuntimeApprovalCommandSchema>;
export const AssistantRuntimeApprovalResultSchema = z.object({ accepted: z.boolean() }).strict();
export type AssistantRuntimeApprovalResult = z.infer<typeof AssistantRuntimeApprovalResultSchema>;

export const AssistantRuntimeClientCommandSchema = z
  .discriminatedUnion('type', [
    AssistantRuntimeApprovalCommandSchema,
    z
      .object({
        type: z.literal('message'),
        runtimeKind: AssistantRuntimeKindSchema.optional(),
        conversationId: z.string().min(1),
        content: z.string().max(200_000),
        surface: AIRuntimeSurfaceSchema,
        providerId: z.string().min(1).optional(),
        modelId: z.string().min(1).optional(),
        /** Stable Mastra instance chosen in the composer (never API vendor ID). */
        agentInstanceId: AgentInstanceSlugSchema.optional(),
        locale: z.enum(['zh-CN', 'en-US']).optional(),
        attachments: z.array(AssistantRuntimeAttachmentSchema).max(4).default([]),
        selectedEntities: z.array(AssistantRuntimeSelectedEntitySchema).max(12).default([]),
        identityId: z.never().optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('cancel_run'),
        runtimeKind: AssistantRuntimeKindSchema.optional(),
        runId: z.string().min(1),
        identityId: z.never().optional(),
      })
      .strict(),
  ])
  .superRefine((command, context) => {
    if (command.type === 'message') {
      const totalAttachmentChars = command.attachments.reduce(
        (total, attachment) => total + attachment.data.length,
        0,
      );
      if (totalAttachmentChars > 1_800_000) {
        context.addIssue({
          code: 'custom',
          path: ['attachments'],
          message: 'Assistant attachment payload is too large',
        });
      }
    }
    if (
      command.type === 'message' &&
      command.content.trim().length === 0 &&
      command.attachments.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['content'],
        message: 'Message requires text or at least one attachment',
      });
    }
  });
export type AssistantRuntimeClientCommand = z.infer<typeof AssistantRuntimeClientCommandSchema>;

export const AssistantRuntimeHistoryClientRequestSchema = z
  .object({
    runtimeKind: AssistantRuntimeKindSchema.optional(),
    conversationId: z.string().min(1),
    identityId: z.never().optional(),
  })
  .strict();
export type AssistantRuntimeHistoryClientRequest = z.infer<
  typeof AssistantRuntimeHistoryClientRequestSchema
>;

export const AssistantRuntimeMessageAttachmentViewSchema = z
  .object({
    mediaType: z.string().trim().min(1).max(120),
    filename: z.string().trim().min(1).max(255).optional(),
  })
  .strict();
export type AssistantRuntimeMessageAttachmentView = z.infer<
  typeof AssistantRuntimeMessageAttachmentViewSchema
>;

export const AssistantRuntimeMessageViewSchema = z
  .object({
    id: z.string().min(1),
    conversationId: z.string().min(1),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    attachments: z.array(AssistantRuntimeMessageAttachmentViewSchema).max(4).default([]),
    nativeActivities: z.array(LocalAgentActivitySchema).max(256).optional(),
    localAgentSource: z
      .object({
        connectionId: z.string().min(1).max(512),
        modelId: z.string().min(1).max(512),
        runId: z.string().min(1).max(512),
      })
      .strict()
      .optional(),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();
export type AssistantRuntimeMessageView = z.infer<typeof AssistantRuntimeMessageViewSchema>;

export const AssistantRuntimeHistoryViewSchema = z
  .object({
    conversationId: z.string().min(1),
    messages: z.array(AssistantRuntimeMessageViewSchema),
    incomplete: z.boolean().optional(),
  })
  .strict();
export type AssistantRuntimeHistoryView = z.infer<typeof AssistantRuntimeHistoryViewSchema>;

export const AssistantRuntimeConversationDeleteResultSchema = z
  .object({ deleted: z.boolean() })
  .strict();
export type AssistantRuntimeConversationDeleteResult = z.infer<
  typeof AssistantRuntimeConversationDeleteResultSchema
>;

export const AssistantRuntimeCancelResultSchema = z.object({ cancelled: z.boolean() }).strict();
export type AssistantRuntimeCancelResult = z.infer<typeof AssistantRuntimeCancelResultSchema>;
