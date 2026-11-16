import { z } from 'zod';
import { GatewayReadError } from '@memoflow/agent-gateway';
import type { McpServer } from '@modelcontextprotocol/server';
import { ASSISTANT_CONVERSATION_EXTERNAL_LIMITS } from '../application/services/assistant-conversation-external-projection';
import type { AssistantConversationExternalReadPort } from '../application/ports/assistant-conversation-external-read.port';
import type { LocalToolContext } from './local-tool-bridge';

/**
 * Hard field whitelist for locally exposed AI conversations.
 *
 * These are the only fields an MCP caller can receive. Provider secrets,
 * permission settings/rules, tool arguments/results, native session ids and
 * attachment bytes have no schema entry here, so they cannot leak by wiring.
 */
export const LOCAL_CONVERSATION_EXTERNAL_FIELD_WHITELIST = {
  summary: ['id', 'title', 'status', 'messageCount', 'createdAt', 'updatedAt'],
  message: ['id', 'role', 'content', 'truncated', 'attachments', 'createdAt'],
  attachment: ['filename', 'mediaType', 'sizeBytes'],
} as const;

const status = z.enum(['Active', 'Archived']);
const attachment = z
  .object({
    filename: z
      .string()
      .max(ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.attachmentFilenameMaxChars)
      .nullable(),
    mediaType: z.string().min(1).max(120),
    sizeBytes: z.number().int().nonnegative().nullable(),
  })
  .strict();
const summary = z
  .object({
    id: z.string().min(1).max(512),
    title: z.string().min(1).max(240),
    status,
    messageCount: z.number().int().nonnegative(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
const message = z
  .object({
    id: z.string().min(1).max(512),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().max(ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messageContentMaxChars),
    truncated: z.boolean(),
    attachments: z
      .array(attachment)
      .max(ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.attachmentCountMaxPerMessage),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();

export const localConversationListInputSchema = z
  .object({
    page: z.number().int().min(1).max(10_000).optional(),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.listPageSizeMax)
      .optional(),
    status: status.optional(),
  })
  .strict();
export const localConversationListOutputSchema = z
  .object({
    conversations: z.array(summary).max(ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.listPageSizeMax),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  })
  .strict();
export const localConversationGetInputSchema = z
  .object({
    conversationId: z.string().min(1).max(512),
    page: z.number().int().min(1).max(10_000).optional(),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messagePageSizeMax)
      .optional(),
  })
  .strict();
export const localConversationGetOutputSchema = z
  .object({
    conversationId: z.string().min(1).max(512),
    messages: z.array(message).max(ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messagePageSizeMax),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    hasMore: z.boolean(),
  })
  .strict();

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * Registers the two local AI-session read tools on an already-authenticated
 * MCP server. Reads only; the projection owns pagination, truncation and
 * attachment metadata.
 */
export function registerLocalConversationReadTools(
  server: McpServer,
  port: AssistantConversationExternalReadPort,
  context: LocalToolContext,
): void {
  async function read(work: () => Promise<Record<string, unknown>>) {
    try {
      await context.authorize('read');
      const value = await context.track(work);
      await context.authorize('read');
      if (Buffer.byteLength(JSON.stringify(value)) > 120 * 1024)
        throw new GatewayReadError('RESPONSE_TOO_LARGE');
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(value) }],
        structuredContent: value,
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text:
              error instanceof GatewayReadError
                ? error.code
                : error instanceof Error && 'code' in error
                  ? String(error.code)
                  : 'UNAVAILABLE',
          },
        ],
      };
    }
  }

  server.registerTool(
    'ai_conversation_list',
    {
      description:
        'List this Profile’s local Agent conversations. Returns metadata only (id, title, status, message count, timestamps); message bodies require ai_conversation_get.',
      inputSchema: localConversationListInputSchema,
      outputSchema: localConversationListOutputSchema,
      annotations,
    },
    (input) =>
      read(async () => {
        const result = await port.listConversations(context, input);
        if (!result.ok) throw new GatewayReadError('INTERNAL_ERROR');
        return { ...result.data } as Record<string, unknown>;
      }),
  );

  server.registerTool(
    'ai_conversation_get',
    {
      description:
        'Read one bounded page of an owned local Agent conversation. Bodies are truncated with an explicit truncated flag; attachments carry filename/type/size metadata only.',
      inputSchema: localConversationGetInputSchema,
      outputSchema: localConversationGetOutputSchema,
      annotations,
    },
    (input) =>
      read(async () => {
        const result = await port.readConversation(context, input.conversationId, {
          page: input.page,
          pageSize: input.pageSize,
        });
        if (!result.ok)
          throw new GatewayReadError(
            result.error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_ERROR',
          );
        return { ...result.data } as Record<string, unknown>;
      }),
  );
}
