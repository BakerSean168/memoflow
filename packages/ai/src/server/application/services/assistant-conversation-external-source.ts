import type { AIConversation } from '../../domain/aggregates/ai-conversation';
import type { IAIConversationRepository } from '../../domain/repositories/i-ai-conversation-repository';
import type {
  AssistantConversationExternalMessageFact,
  AssistantConversationExternalReadSource,
  AssistantConversationExternalShellFact,
} from '../ports/assistant-conversation-external-read.port';

/**
 * Owner-scoped message counts without loading message bodies.
 *
 * The transcript lives in Mastra storage, but a list page only needs the count
 * so the projection can report `total`/`hasMore` without recalling every
 * conversation. Implementations must scope by `identityId` and ignore deleted
 * shells.
 */
export interface AssistantConversationMessageCountSource {
  countsByIdentity(identityId: string): Promise<ReadonlyMap<string, number>>;
  countByIdentity(identityId: string, conversationId: string): Promise<number>;
}

/**
 * Read-only transcript seam.
 *
 * Deliberately narrower than `AssistantHistoryService.listMessages`: the
 * implementation must not provision a thread while reading, so an external
 * read cannot write as a side effect.
 */
export interface AssistantConversationHistoryReader {
  readMessages(input: { identityId: string; conversationId: string }): Promise<{
    readonly messages: readonly {
      readonly id: string;
      readonly role: 'user' | 'assistant' | 'system';
      readonly content: string;
      readonly attachments?: readonly {
        readonly mediaType: string;
        readonly filename?: string;
      }[];
      readonly createdAt: number;
    }[];
  }>;
}

export interface AssistantConversationExternalSourceDependencies {
  readonly shells: Pick<IAIConversationRepository, 'findByIdentityId' | 'findByIdForIdentity'>;
  readonly counts: AssistantConversationMessageCountSource;
  readonly history: AssistantConversationHistoryReader;
}

function shellFact(
  conversation: AIConversation,
  messageCount: number,
): AssistantConversationExternalShellFact {
  return {
    id: String(conversation.id),
    title: conversation.name,
    status: conversation.status,
    messageCount,
    createdAt: conversation.createdAt.getTime(),
    updatedAt: conversation.updatedAt.getTime(),
  };
}

function messageFact(
  message: Awaited<
    ReturnType<AssistantConversationHistoryReader['readMessages']>
  >['messages'][number],
): AssistantConversationExternalMessageFact {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    createdAt: message.createdAt,
  };
}

/**
 * Binds the AI-owned shell repository and transcript reader to the bounded
 * external projection source (#977).
 *
 * The source only supplies owner-scoped facts; pagination, truncation and
 * not-found semantics stay in `createAssistantConversationExternalReadPort`.
 */
export function createAssistantConversationExternalSource(
  dependencies: AssistantConversationExternalSourceDependencies,
): AssistantConversationExternalReadSource {
  return {
    async listOwnedShells(identityId, status) {
      const [conversations, counts] = await Promise.all([
        dependencies.shells.findByIdentityId(identityId),
        dependencies.counts.countsByIdentity(identityId),
      ]);
      return conversations
        .filter((conversation) => !conversation.deletedAt)
        .filter((conversation) => !status || conversation.status === status)
        .map((conversation) =>
          shellFact(conversation, counts.get(String(conversation.id)) ?? 0),
        );
    },

    async findOwnedShell(identityId, conversationId) {
      const conversation = await dependencies.shells.findByIdForIdentity(
        identityId,
        conversationId,
      );
      if (!conversation || conversation.deletedAt) return null;
      const messageCount = await dependencies.counts.countByIdentity(identityId, conversationId);
      return shellFact(conversation, messageCount);
    },

    async readMessagePage(identityId, conversationId, slice) {
      if (slice.limit <= 0 || slice.offset < 0) return [];
      const history = await dependencies.history.readMessages({ identityId, conversationId });
      return history.messages
        .slice(slice.offset, slice.offset + slice.limit)
        .map((message) => messageFact(message));
    },
  };
}
