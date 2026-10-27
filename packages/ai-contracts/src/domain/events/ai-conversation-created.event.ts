import type { IdentityId } from '@memoflow/shared-primitives';
import type { AIConversationServerDTO } from '../../aggregates/ai-conversation-server';

export interface AIConversationCreatedEvent {
  identityId: IdentityId;
  conversation: AIConversationServerDTO;
}
