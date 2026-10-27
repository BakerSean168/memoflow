import type { AttentionEventSource } from './attention-events.port';
import type {
  AssistantAttentionState,
  AssistantAttentionRuntimeKind,
  AssistantAttentionView,
} from '@memoflow/ai-contracts';

export const ASSISTANT_ATTENTION_LEASE_MS = 120_000;

export interface AssistantAttentionTransition {
  identityId: string;
  runtimeKind: AssistantAttentionRuntimeKind;
  conversationId: string;
  runId: string;
  sequence: number;
  state: AssistantAttentionState;
  occurredAt: number;
}

export interface AssistantAttentionIdentity {
  identityId: string;
  runtimeKind: AssistantAttentionRuntimeKind;
  conversationId: string;
}
export interface AssistantAttentionLookup {
  identityId: string;
  runtimeKind: AssistantAttentionRuntimeKind;
  conversationIds: string[];
}
export interface AssistantAttentionAcknowledge extends AssistantAttentionIdentity {
  revision: number;
}

export interface IConversationAttentionPort {
  readonly events?: AttentionEventSource;
  transition(input: AssistantAttentionTransition): Promise<void>;
  heartbeat(input: AssistantAttentionIdentity & { runId: string }): Promise<void>;
  list(input: AssistantAttentionLookup): Promise<AssistantAttentionView[]>;
  acknowledge(input: AssistantAttentionAcknowledge): Promise<boolean>;
  forget(input: AssistantAttentionIdentity): Promise<void>;
}

/** A stale process-local Working/Approval/Input lease is not evidence of a running Agent. */
export function effectiveAssistantAttentionState(
  input: {
    state: AssistantAttentionState;
    revision: number;
    seenRevision: number;
    updatedAt: number;
  },
  now = Date.now(),
): AssistantAttentionState {
  if (input.state === 'done' && input.seenRevision >= input.revision) return 'normal';
  if (
    ['working', 'input', 'approval'].includes(input.state) &&
    now - input.updatedAt > ASSISTANT_ATTENTION_LEASE_MS
  )
    return 'normal';
  return input.state;
}
