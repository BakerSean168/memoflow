import type { AIConversation } from '../aggregates/ai-conversation';

/** Persistence of the product-owned conversation shell only. */
export interface IAIConversationRepository {
  save(conversation: AIConversation): Promise<void>;
  findByIdForIdentity(identityId: string, id: string): Promise<AIConversation | null>;
  findByIdentityId(identityId: string): Promise<AIConversation[]>;
  delete(identityId: string, id: string): Promise<void>;
}
