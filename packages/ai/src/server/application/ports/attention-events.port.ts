import type { AssistantAttentionView, AssistantAttentionRuntimeKind } from '@memoflow/contracts/ai';

export interface AttentionChange {
  eventId: string;
  sequence: number;
  resourceVersion: number;
  data: {
    conversationId: string;
    runtimeKind: AssistantAttentionRuntimeKind;
    attention: AssistantAttentionView | null;
  };
}

/** Attention's committed projection, including read receipts, expiry and deletion. */
export interface AttentionEventSource {
  readonly epoch: string;
  init(): Promise<void>;
  head(identityId: string): Promise<{ first: number; last: number }>;
  read(identityId: string, after: number): Promise<AttentionChange[]>;
  snapshot(
    identityId: string,
    conversationIds: readonly string[],
    runtimeKind: AssistantAttentionRuntimeKind,
  ): Promise<AssistantAttentionView[]>;
  subscribe(wake: () => void): () => void;
  dispose(): Promise<void>;
}
