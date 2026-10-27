import type {
  AssistantAttentionRuntimeKind,
  AssistantAttentionState,
  AssistantRuntimeEvent,
} from '@memoflow/ai-contracts';
import type { IConversationAttentionPort } from '../ports/conversation-attention.port';

/**
 * Turns *public* Assistant events into owner-scoped, bounded attention state.
 * No tool arguments, prompts or checkpoint material are stored.
 */
export class ConversationAttentionObserver {
  private readonly sessions = new Map<
    string,
    {
      runId: string;
      approvals: Set<string>;
      requests: Set<string>;
      state: AssistantAttentionState;
    }
  >();
  constructor(private readonly store: IConversationAttentionPort) {}
  private key(identityId: string, runtimeKind: string, conversationId: string) {
    return JSON.stringify([identityId, runtimeKind, conversationId]);
  }

  async observe(
    identityId: string,
    runtimeKind: AssistantAttentionRuntimeKind,
    event: AssistantRuntimeEvent,
  ): Promise<void> {
    const key = this.key(identityId, runtimeKind, event.conversationId);
    let session = this.sessions.get(key);
    if (!session || session.runId !== event.runId) {
      // Do not resurrect an old session from a delayed terminal event. The
      // persistence adapter fences late transitions by run ID and sequence.
      session = {
        runId: event.runId,
        approvals: new Set(),
        requests: new Set(),
        state: 'working',
      };
      this.sessions.set(key, session);
    }
    if (event.type === 'assistant.approval.required') {
      session.approvals.add(event.data.toolCallId);
    } else if (event.type === 'assistant.approval.resolved') {
      session.approvals.delete(event.data.toolCallId);
    } else if (event.type === 'assistant.request.required') {
      session.requests.add(event.data.requestId);
    } else if (event.type === 'assistant.request.resolved') {
      session.requests.delete(event.data.requestId);
    }

    let state: AssistantAttentionState;
    if (event.type === 'assistant.run.completed') state = 'done';
    else if (event.type === 'assistant.run.failed') state = 'failed';
    else if (event.type === 'assistant.run.cancelled') state = 'normal';
    else if (session.approvals.size > 0) state = 'approval';
    else if (session.requests.size > 0) state = 'input';
    else state = 'working';

    // Ignore ordinary text deltas and activity: status remains unchanged.
    if (
      state !== session.state ||
      event.type === 'assistant.run.started' ||
      event.type === 'assistant.run.completed' ||
      event.type === 'assistant.run.failed' ||
      event.type === 'assistant.run.cancelled'
    ) {
      session.state = state;
      await this.store.transition({
        identityId,
        runtimeKind,
        conversationId: event.conversationId,
        runId: event.runId,
        sequence: event.sequence,
        state,
        occurredAt: event.createdAt,
      });
    }
    if (
      event.type === 'assistant.run.completed' ||
      event.type === 'assistant.run.failed' ||
      event.type === 'assistant.run.cancelled'
    )
      this.sessions.delete(key);
  }

  async heartbeat(
    identityId: string,
    runtimeKind: AssistantAttentionRuntimeKind,
    conversationId: string,
  ): Promise<void> {
    const session = this.sessions.get(this.key(identityId, runtimeKind, conversationId));
    if (!session) return;
    await this.store.heartbeat({ identityId, runtimeKind, conversationId, runId: session.runId });
  }
}
