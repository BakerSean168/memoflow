import { z } from 'zod';
import { AgentDriverKindSchema } from '@memoflow/ai-contracts';

/**
 * External AI read contracts.
 *
 * Every bound here mirrors the bounded projection delivered by the AI
 * application layer (#977): a conversation list page is at most 50 metadata
 * rows, a transcript page at most 25 messages, each body is already cut to
 * 2000 characters with an explicit `truncated` flag, and attachments carry
 * metadata only. The gateway must never widen those bounds.
 */
export const AiConversationStatusSchema = z.enum(['Active', 'Archived']);

export const AiConversationSummarySchema = z.strictObject({
  id: z.string().min(1).max(200),
  title: z.string().max(500),
  status: AiConversationStatusSchema,
  messageCount: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const AiConversationAttachmentSchema = z.strictObject({
  filename: z.string().max(255).nullable(),
  mediaType: z.string().min(1).max(200),
  sizeBytes: z.number().int().nonnegative().nullable(),
});

export const AiConversationMessageSchema = z.strictObject({
  id: z.string().min(1).max(200),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(2000),
  truncated: z.boolean(),
  attachments: z.array(AiConversationAttachmentSchema).max(8),
  createdAt: z.number().int().nonnegative(),
});

export const AiConversationListInputSchema = z.strictObject({
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  status: AiConversationStatusSchema.optional(),
});

export const AiConversationListOutputSchema = z.strictObject({
  conversations: z.array(AiConversationSummarySchema).max(50),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export const AiConversationGetInputSchema = z.strictObject({
  id: z.string().min(1).max(200),
});

export const AiConversationTranscriptInputSchema = z.strictObject({
  id: z.string().min(1).max(200),
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(25).default(10),
});

export const AiConversationTranscriptOutputSchema = z.strictObject({
  conversationId: z.string().min(1).max(200),
  messages: z.array(AiConversationMessageSchema).max(25),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  hasMore: z.boolean(),
});

export const AiAgentEntrySchema = z.strictObject({
  instanceId: z.string().min(1).max(200),
  driver: AgentDriverKindSchema,
  name: z.string().min(1).max(200),
  enabled: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const AiAgentListInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(50).default(50),
});

export const AiAgentListOutputSchema = z.strictObject({
  agents: z.array(AiAgentEntrySchema).max(50),
  truncated: z.literal('archive-limit').optional(),
});

export const AiAgentGetInputSchema = z.strictObject({
  instanceId: z.string().min(1).max(200),
});

export const AiAgentGetOutputSchema = z.strictObject({ agent: AiAgentEntrySchema });
