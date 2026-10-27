import type { IdentityId } from '@memoflow/shared-primitives';
import type { AiConversationId } from '../../ids';
import type { AIConversationServerDTO } from '../../aggregates/ai-conversation-server';

export interface AIConversationDeletedEvent {
  identityId: IdentityId;
  conversationId: AiConversationId;
  conversation: AIConversationServerDTO;
  deletedAt: number;
}
