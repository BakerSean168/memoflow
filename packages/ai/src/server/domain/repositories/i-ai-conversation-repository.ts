import type { ConversationEventSource } from './conversation-events.port';
import type { AIConversation } from '../aggregates/ai-conversation';

/** Persistence of the product-owned conversation shell only. */
export interface IAIConversationRepository {
  readonly events?: ConversationEventSource;
  saveStatus(conversation: AIConversation): Promise<boolean>;
  saveTitle(conversation: AIConversation, expectedVersion: number): Promise<boolean>;
  save(conversation: AIConversation): Promise<void>;
  findByIdForIdentity(
    identityId: string,
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<AIConversation | null>;
  findByIdentityId(identityId: string): Promise<AIConversation[]>;
  delete(identityId: string, id: string): Promise<void>;
  /** Advance activity monotonically without overwriting title/config or reviving deleted shells. */
  recordActivity(identityId: string, id: string, at: number): Promise<void>;
}
