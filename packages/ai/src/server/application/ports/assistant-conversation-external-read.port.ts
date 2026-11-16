import type { ExecutionContext } from '@memoflow/transport-contracts';
import type { Result } from '@memoflow/transport-contracts/result';

export type AssistantConversationExternalStatus = 'Active' | 'Archived';
export type AssistantConversationExternalRole = 'user' | 'assistant' | 'system';

/** Conversation metadata as seen by an external reader; never carries a message body. */
export interface AssistantConversationExternalSummary {
  readonly id: string;
  readonly title: string;
  readonly status: AssistantConversationExternalStatus;
  readonly messageCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Attachment metadata only: no bytes, storage key or download URL. */
export interface AssistantConversationExternalAttachment {
  readonly filename: string | null;
  readonly mediaType: string;
  readonly sizeBytes: number | null;
}

export interface AssistantConversationExternalMessage {
  readonly id: string;
  readonly role: AssistantConversationExternalRole;
  /** Bounded by `ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messageContentMaxChars`. */
  readonly content: string;
  /** True when the body was cut at the character cap above. */
  readonly truncated: boolean;
  readonly attachments: readonly AssistantConversationExternalAttachment[];
  readonly createdAt: number;
}

export interface AssistantConversationExternalSummaryPage {
  readonly conversations: readonly AssistantConversationExternalSummary[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface AssistantConversationExternalTranscript {
  readonly conversationId: string;
  readonly messages: readonly AssistantConversationExternalMessage[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

export interface AssistantConversationExternalListQuery {
  readonly page?: number;
  /** Clamped to `ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.listPageSizeMax`. */
  readonly pageSize?: number;
  readonly status?: AssistantConversationExternalStatus;
}

export interface AssistantConversationExternalTranscriptQuery {
  readonly page?: number;
  /** Clamped to `ASSISTANT_CONVERSATION_EXTERNAL_LIMITS.messagePageSizeMax`. */
  readonly pageSize?: number;
}

/**
 * Owner-scoped, bounded read seam for Assistant conversations.
 *
 * Deliberately narrower than `AssistantConversationPort`: it cannot create,
 * mutate or delete, and every read is scoped by the caller's identity. A
 * conversation owned by someone else is indistinguishable from a missing one
 * (`NOT_FOUND`).
 */
export interface AssistantConversationExternalReadPort {
  listConversations(
    cx: ExecutionContext,
    query?: AssistantConversationExternalListQuery,
  ): Promise<Result<AssistantConversationExternalSummaryPage>>;

  readConversation(
    cx: ExecutionContext,
    conversationId: string,
    query?: AssistantConversationExternalTranscriptQuery,
  ): Promise<Result<AssistantConversationExternalTranscript>>;
}

/**
 * Owner-scoped source the projection reads from.
 *
 * Facts stay minimal on purpose: a host adapter has no field to put file bytes,
 * a storage key or a signed URL into, so redaction cannot be lost by wiring.
 */
export interface AssistantConversationExternalShellFact {
  readonly id: string;
  readonly title: string;
  readonly status: AssistantConversationExternalStatus;
  readonly messageCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface AssistantConversationExternalAttachmentFact {
  readonly mediaType: string;
  readonly filename?: string;
  readonly sizeBytes?: number;
}

export interface AssistantConversationExternalMessageFact {
  readonly id: string;
  readonly role: AssistantConversationExternalRole;
  readonly content: string;
  readonly attachments?: readonly AssistantConversationExternalAttachmentFact[];
  readonly createdAt: number;
}

export interface AssistantConversationExternalReadSource {
  /** Live (non-deleted) shells owned by `identityId`, in any order. */
  listOwnedShells(
    identityId: string,
    status?: AssistantConversationExternalStatus,
  ): Promise<readonly AssistantConversationExternalShellFact[]>;
  findOwnedShell(
    identityId: string,
    conversationId: string,
  ): Promise<AssistantConversationExternalShellFact | null>;
  /** One bounded, `createdAt`-ordered slice of an owned conversation's transcript. */
  readMessagePage(
    identityId: string,
    conversationId: string,
    slice: { readonly offset: number; readonly limit: number },
  ): Promise<readonly AssistantConversationExternalMessageFact[]>;
}
