import type { IdentityId } from '@memoflow/shared-primitives';
import type { AIConversationServerDTO } from '../../aggregates/ai-conversation-server';

export interface AIConversationUpdatedEvent {
  identityId: IdentityId;
  conversation: AIConversationServerDTO;
  changes: string[];
}
