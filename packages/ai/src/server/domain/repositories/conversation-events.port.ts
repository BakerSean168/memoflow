import type { AIConversationClientDTO } from '@memoflow/contracts/ai';

export interface ConversationChange {
  eventId: string;
  sequence: number;
  resourceVersion: number;
  data: {
    conversationId: string;
    runtimeKind: 'builtin';
    conversation: AIConversationClientDTO | null;
  };
}

/** Committed product shell summaries; message contents and native Agent history stay separate. */
export interface ConversationEventSource {
  readonly epoch: string;
  init(): Promise<void>;
  head(identityId: string): Promise<{ first: number; last: number }>;
  read(identityId: string, after: number): Promise<ConversationChange[]>;
  snapshot(
    identityId: string,
    conversationIds: readonly string[],
  ): Promise<AIConversationClientDTO[]>;
  subscribe(wake: () => void): () => void;
  dispose(): Promise<void>;
}
