import type { IdentityId } from '@memoflow/shared-primitives';
import type { AIConversationServerDTO } from '../../aggregates/ai-conversation-server';
import type { ConversationStatus } from '../../value-objects/conversation-status';

export interface AIConversationStatusChangedEvent {
  identityId: IdentityId;
  conversation: AIConversationServerDTO;
  oldStatus: ConversationStatus;
  newStatus: ConversationStatus;
}
