import { error, ok } from '@memoflow/transport-contracts/result';
import type {
  AssistantConversationExternalAttachment,
  AssistantConversationExternalAttachmentFact,
  AssistantConversationExternalMessage,
  AssistantConversationExternalMessageFact,
  AssistantConversationExternalReadPort,
  AssistantConversationExternalReadSource,
  AssistantConversationExternalShellFact,
  AssistantConversationExternalSummary,
  AssistantConversationExternalSummaryPage,
  AssistantConversationExternalTranscript,
  AssistantConversationExternalTranscriptQuery,
  AssistantConversationExternalListQuery,
} from '../ports/assistant-conversation-external-read.port';

/**
 * Hard bounds for one external read.
 *
 * 外部读取的硬上限。
 *
 * These are context-budget and privacy-minimisation bounds, not performance
 * knobs: an external Agent (cloud MCP tool result) pays tokens for every
 * character it receives, and conversation bodies are private owner content that
 * should only leave the owner's surface in the slice actually requested.
 *
 * Worst case for one transcript page is `messagePageSizeMax *
 * messageContentMaxChars` = 50k characters (~12k tokens); one list page stays
 * under ~50 small metadata rows. Raising these values widens both the token
 * budget an external caller can force and the amount of private body text a
 * single read can pull.
 */
export const ASSISTANT_CONVERSATION_EXTERNAL_LIMITS = {
  /** One list page; more than a screenful is not useful for discovery. */
  listPageSizeDefault: 20,
  listPageSizeMax: 50,
  /** One transcript page; keeps a body read to a bounded context slice. */
  messagePageSizeDefault: 10,
  messagePageSizeMax: 25,
  /** Per-message body cap; longer bodies are cut and flagged `truncated`. */
  messageContentMaxChars: 2000,
  /** Attachment names are metadata, not content: cap to the product title bound. */
  attachmentFilenameMaxChars: 255,
  /** A single message cannot flood a page with attachment rows. */
  attachmentCountMaxPerMessage: 8,
} as const;

interface BoundedPage {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

function boundedPage(
  page: number | undefined,
  pageSize: number | undefined,
  defaultSize: number,
  maxSize: number,
): BoundedPage {
  const normalizedPage = Number.isFinite(page) ? Math.max(1, Math.trunc(page as number)) : 1;
  const normalizedSize = Number.isFinite(pageSize)
    ? Math.min(maxSize, Math.max(1, Math.trunc(pageSize as number)))
    : defaultSize;
  return {
    page: normalizedPage,
    pageSize: normalizedSize,
    offset: (normalizedPage - 1) * normalizedSize,
  };
}

function boundedText(
  text: string,
  maxChars: number,
): { readonly text: string; readonly truncated: boolean } {
  const codePoints = Array.from(text);
  if (codePoints.length <= maxChars) return { text, truncated: false };
  return { text: codePoints.slice(0, maxChars).join(''), truncated: true };
}

function projectAttachment(
  attachment: AssistantConversationExternalAttachmentFact,
): AssistantConversationExternalAttachment {
  return {
    filename:
      typeof attachment.filename === 'string' && attachment.filename.trim().length > 0
        ? boundedText(
            attachment.filename.trim(),
            ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.attachmentFilenameMaxChars,
          ).text
        : null,
    mediaType: attachment.mediaType,
    sizeBytes:
      typeof attachment.sizeBytes === 'number' && Number.isFinite(attachment.sizeBytes)
        ? Math.max(0, Math.trunc(attachment.sizeBytes))
        : null,
  };
}

function projectMessage(
  fact: AssistantConversationExternalMessageFact,
): AssistantConversationExternalMessage {
  const body = boundedText(
    fact.content,
    ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messageContentMaxChars,
  );
  const attachments = (fact.attachments ?? [])
    .slice(0, ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.attachmentCountMaxPerMessage)
    .map(projectAttachment);

  return {
    id: fact.id,
    role: fact.role,
    content: body.text,
    truncated: body.truncated,
    attachments,
    createdAt: fact.createdAt,
  };
}

function projectSummary(
  fact: AssistantConversationExternalShellFact,
): AssistantConversationExternalSummary {
  return {
    id: fact.id,
    title: fact.title,
    status: fact.status,
    messageCount: fact.messageCount,
    createdAt: fact.createdAt,
    updatedAt: fact.updatedAt,
  };
}

function byUpdatedAtDesc(
  left: AssistantConversationExternalSummary,
  right: AssistantConversationExternalSummary,
): number {
  if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

/**
 * Builds the bounded external read projection over an owner-scoped source.
 *
 * The projection owns pagination, body truncation, attachment redaction and
 * not-found semantics; the source only supplies owner-scoped facts. Keeping
 * the bounds here means every host that wires the seam shares the same limits.
 */
export function createAssistantConversationExternalReadPort(
  source: AssistantConversationExternalReadSource,
): AssistantConversationExternalReadPort {
  return {
    async listConversations(cx, query: AssistantConversationExternalListQuery = {}) {
      const { page, pageSize, offset } = boundedPage(
        query.page,
        query.pageSize,
        ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.listPageSizeDefault,
        ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.listPageSizeMax,
      );
      try {
        const shells = [...(await source.listOwnedShells(cx.identityId, query.status))];
        const summaries = shells.map((shell) => projectSummary(shell)).sort(byUpdatedAtDesc);
        const result: AssistantConversationExternalSummaryPage = {
          conversations: summaries.slice(offset, offset + pageSize),
          total: summaries.length,
          page,
          pageSize,
        };
        return ok(result);
      } catch (cause) {
        return error(
          'INTERNAL_ERROR',
          cause instanceof Error ? cause.message : 'Failed to list conversations',
        );
      }
    },

    async readConversation(
      cx,
      conversationId,
      query: AssistantConversationExternalTranscriptQuery = {},
    ) {
      const { page, pageSize, offset } = boundedPage(
        query.page,
        query.pageSize,
        ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messagePageSizeDefault,
        ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messagePageSizeMax,
      );
      try {
        // Cross-owner and missing are one answer: the caller cannot probe existence.
        const shell = await source.findOwnedShell(cx.identityId, conversationId);
        if (!shell) return error('NOT_FOUND', 'Conversation not found');

        const facts = await source.readMessagePage(cx.identityId, conversationId, {
          offset,
          limit: pageSize,
        });
        const transcript: AssistantConversationExternalTranscript = {
          conversationId: shell.id,
          messages: facts.map(projectMessage),
          total: shell.messageCount,
          page,
          pageSize,
          hasMore: offset + facts.length < shell.messageCount,
        };
        return ok(transcript);
      } catch (cause) {
        return error(
          'INTERNAL_ERROR',
          cause instanceof Error ? cause.message : 'Failed to read conversation',
        );
      }
    },
  };
}
