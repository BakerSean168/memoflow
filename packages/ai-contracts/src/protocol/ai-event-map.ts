import type { AIConversationCreatedEvent } from '../domain/events/ai-conversation-created.event';
import type { AIConversationDeletedEvent } from '../domain/events/ai-conversation-deleted.event';
import type { AIConversationStatusChangedEvent } from '../domain/events/ai-conversation-status-changed.event';
import type { AIConversationUpdatedEvent } from '../domain/events/ai-conversation-updated.event';
import type { AIProviderConfigCreatedEvent } from '../domain/events/ai-provider-config-created.event';
import type { AIProviderConfigModelsUpdatedEvent } from '../domain/events/ai-provider-config-models-updated.event';
import type { AIProviderConfigSetDefaultEvent } from '../domain/events/ai-provider-config-set-default.event';
import type { AssistantRuntimeEvent } from '../api/ai-runtime.dto';

/** AI domain events plus the canonical Mastra Assistant transport projection. */
export type AIEventMap = {
  'ai:conversation-created': AIConversationCreatedEvent;
  'ai:conversation-updated': AIConversationUpdatedEvent;
  'ai:conversation-status-changed': AIConversationStatusChangedEvent;
  'ai:conversation-deleted': AIConversationDeletedEvent;
  'ai:provider-config-created': AIProviderConfigCreatedEvent;
  'ai:provider-config-models-updated': AIProviderConfigModelsUpdatedEvent;
  'ai:provider-config-set-default': AIProviderConfigSetDefaultEvent;
  'ai:runtime:assistant:event': { streamId: string; event: AssistantRuntimeEvent };
  'ai:runtime:assistant:error': {
    streamId: string;
    code: string;
    message: string;
  };
};
