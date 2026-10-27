import { describe, expect, it, vi } from 'vitest';
import type { AssistantRuntimeEvent } from '@memoflow/ai-contracts';
import { ConversationAttentionObserver } from './conversation-attention-observer';
import type { IConversationAttentionPort } from '../ports/conversation-attention.port';

const event = (type: AssistantRuntimeEvent['type'], sequence: number, data: unknown) =>
  ({
    type,
    eventId: `run-1:${sequence}`,
    runId: 'run-1',
    sequence,
    conversationId: 'conv-1',
    createdAt: 1_000 + sequence,
    data,
  }) as AssistantRuntimeEvent;

function fixture() {
  const store = {
    transition: vi.fn(async () => {}),
    heartbeat: vi.fn(async () => {}),
    list: vi.fn(async () => []),
    acknowledge: vi.fn(async () => true),
    forget: vi.fn(async () => {}),
  } satisfies IConversationAttentionPort;
  const observer = new ConversationAttentionObserver(store);
  return { observer, store };
}
describe('durable conversation attention observer', () => {
  it('tracks overlapping approvals without marking Working until all gates are resolved', async () => {
    const { observer, store } = fixture();
    const send = (x: AssistantRuntimeEvent) => observer.observe('owner-1', 'builtin', x);
    await send(event('assistant.run.started', 1, {}));
    await send(event('assistant.approval.required', 2, { toolCallId: 'tool-a' }));
    await send(event('assistant.approval.required', 3, { toolCallId: 'tool-b' }));
    await send(
      event('assistant.approval.resolved', 4, { toolCallId: 'tool-a', resolution: 'approved' }),
    );
    await send(
      event('assistant.approval.resolved', 5, { toolCallId: 'tool-b', resolution: 'approved' }),
    );
    await send(event('assistant.run.completed', 6, { content: 'done' }));
    expect(store.transition.mock.calls.map(([call]) => call.state)).toEqual([
      'working',
      'approval',
      'working',
      'done',
    ]);
    expect(store.transition.mock.calls[0]?.[0]).toMatchObject({
      identityId: 'owner-1',
      runtimeKind: 'builtin',
      conversationId: 'conv-1',
      runId: 'run-1',
      sequence: 1,
    });
  });

  it('prioritizes approval over Ask User and returns to Input when approval settles', async () => {
    const { observer, store } = fixture();
    const send = (x: AssistantRuntimeEvent) => observer.observe('owner', 'local_agent', x);
    await send(event('assistant.run.started', 1, {}));
    await send(event('assistant.request.required', 2, { requestId: 'ask-1' }));
    await send(event('assistant.approval.required', 3, { toolCallId: 'approval-1' }));
    await send(
      event('assistant.approval.resolved', 4, { toolCallId: 'approval-1', resolution: 'approved' }),
    );
    await send(
      event('assistant.request.resolved', 5, { requestId: 'ask-1', resolution: 'answered' }),
    );
    await send(event('assistant.run.failed', 6, { code: 'FAILED', message: 'failure' }));
    expect(store.transition.mock.calls.map(([call]) => call.state)).toEqual([
      'working',
      'input',
      'approval',
      'input',
      'working',
      'failed',
    ]);
    expect(store.transition.mock.calls[1]?.[0].runtimeKind).toBe('local_agent');
    expect(store.transition.mock.calls.every(([call]) => !('data' in call))).toBe(true);
  });

  it('avoids persisting every token and fences the heartbeat to its run', async () => {
    const { observer, store } = fixture();
    await observer.observe('owner', 'builtin', event('assistant.run.started', 1, {}));
    await observer.observe(
      'owner',
      'builtin',
      event('assistant.message.delta', 2, { content: 'secret output' }),
    );
    await observer.heartbeat('owner', 'builtin', 'conv-1');
    await observer.observe('owner', 'builtin', event('assistant.run.cancelled', 3, {}));
    await observer.heartbeat('owner', 'builtin', 'conv-1');
    expect(store.transition.mock.calls.map(([call]) => call.state)).toEqual(['working', 'normal']);
    expect(store.heartbeat).toHaveBeenCalledTimes(1);
    expect(store.heartbeat.mock.calls[0]?.[0].runId).toBe('run-1');
  });
});
