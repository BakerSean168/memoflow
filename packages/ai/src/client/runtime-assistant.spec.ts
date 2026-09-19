import { describe, expect, it, vi } from 'vitest';
import { AIChannels, AIStreamChannels } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import {
  AssistantRuntimeHttpClient,
  AssistantRuntimeIpcClient,
  type AssistantRuntimeMessageCommand,
} from './runtime-assistant';

function httpStub(overrides: Partial<IResultHttpClient> = {}): IResultHttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    stream: vi.fn(),
    ...overrides,
  };
}

function sse(events: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(event));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

function bridgeHarness() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const bridge = {
    invoke: vi.fn(),
    on: vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
      const set = listeners.get(channel) ?? new Set();
      set.add(callback);
      listeners.set(channel, set);
    }),
    off: vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
      listeners.get(channel)?.delete(callback);
    }),
  };
  const emit = (channel: string, payload: unknown) => {
    for (const callback of listeners.get(channel) ?? []) callback(payload);
  };
  return { bridge, emit };
}

const command: AssistantRuntimeMessageCommand = {
  type: 'message',
  conversationId: 'conversation-1',
  content: 'hello',
  surface: 'web',
};

const started = {
  eventId: 'run-1:1',
  runId: 'run-1',
  conversationId: 'conversation-1',
  sequence: 1,
  createdAt: 1,
  type: 'assistant.run.started' as const,
  data: {},
};

const completed = {
  eventId: 'run-1:2',
  runId: 'run-1',
  conversationId: 'conversation-1',
  sequence: 2,
  createdAt: 2,
  type: 'assistant.run.completed' as const,
  data: { content: 'hello back' },
};

describe('AssistantRuntimeHttpClient', () => {
  it('loads authoritative history from the canonical runtime endpoint without identity payloads', async () => {
    const history = {
      conversationId: 'conversation-1',
      messages: [
        {
          id: 'message-1',
          conversationId: 'conversation-1',
          role: 'assistant' as const,
          content: 'persisted reply',
          createdAt: 1,
        },
      ],
    };
    const post = vi.fn().mockResolvedValue(ok(history));
    const client = new AssistantRuntimeHttpClient(httpStub({ post }));

    await expect(client.listMessages('conversation-1')).resolves.toEqual(history);
    expect(post).toHaveBeenCalledWith('/ai/runtime/assistant/history', {
      conversationId: 'conversation-1',
    });
    expect(JSON.stringify(post.mock.calls)).not.toContain('identityId');
  });

  it('deletes the owner-scoped Mastra conversation through the canonical runtime endpoint', async () => {
    const post = vi.fn().mockResolvedValue(ok({ deleted: true }));
    const client = new AssistantRuntimeHttpClient(httpStub({ post }));

    await expect(client.deleteConversation('conversation-1')).resolves.toBe(true);
    expect(post).toHaveBeenCalledWith('/ai/runtime/assistant/delete', {
      conversationId: 'conversation-1',
    });
    expect(JSON.stringify(post.mock.calls)).not.toContain('identityId');
  });

  it('streams only canonical runtime events and never adds identity to the command', async () => {
    const stream = vi
      .fn()
      .mockResolvedValue(
        sse([
          `event: runtime\ndata: ${JSON.stringify(started)}\n\n`,
          `event: runtime\ndata: ${JSON.stringify(completed)}\n\n`,
        ]),
      );
    const client = new AssistantRuntimeHttpClient(httpStub({ stream }));
    const events: unknown[] = [];

    await client.streamMessage(command, { onEvent: (event) => events.push(event) });

    expect(stream).toHaveBeenCalledWith(
      '/ai/runtime/assistant/sse',
      expect.objectContaining({ method: 'POST', body: command }),
    );
    expect(JSON.stringify(stream.mock.calls[0][1].body)).not.toContain('identityId');
    expect(events).toEqual([started, completed]);
  });

  it('fails closed on unknown runtime frames and client identity injection', async () => {
    const unknownFrameClient = new AssistantRuntimeHttpClient(
      httpStub({ stream: vi.fn().mockResolvedValue(sse(['event: private\ndata: {}\n\n'])) }),
    );
    await expect(unknownFrameClient.streamMessage(command, {})).rejects.toMatchObject({
      code: 'AI_RUNTIME_PROTOCOL_ERROR',
    });

    const identityClient = new AssistantRuntimeHttpClient(httpStub());
    await expect(
      identityClient.streamMessage({ ...command, identityId: 'attacker' } as never, {}),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('uses the canonical cancel command and returns the owner-scoped cancellation result', async () => {
    const post = vi.fn().mockResolvedValue(ok({ cancelled: true }));
    const client = new AssistantRuntimeHttpClient(httpStub({ post }));

    await expect(client.cancelRun('run-1')).resolves.toBe(true);
    expect(post).toHaveBeenCalledWith('/ai/runtime/assistant/cancel', {
      type: 'cancel_run',
      runId: 'run-1',
    });
  });

  it('fails closed when the HTTP cancel result violates the runtime contract', async () => {
    const post = vi.fn().mockResolvedValue(ok({ cancelled: 'yes' }));
    const client = new AssistantRuntimeHttpClient(httpStub({ post }));

    await expect(client.cancelRun('run-1')).rejects.toMatchObject({
      code: 'AI_RUNTIME_PROTOCOL_ERROR',
    });
  });
});

describe('AssistantRuntimeIpcClient', () => {
  it('loads authoritative history over the canonical IPC request channel', async () => {
    const history = {
      conversationId: 'conversation-1',
      messages: [
        {
          id: 'message-1',
          conversationId: 'conversation-1',
          role: 'assistant' as const,
          content: 'persisted reply',
          createdAt: 1,
        },
      ],
    };
    const invoke = vi.fn(async () => ok(history));
    const client = new AssistantRuntimeIpcClient({ invoke } as never);

    await expect(client.listMessages('conversation-1')).resolves.toEqual(history);
    expect(invoke).toHaveBeenCalledWith(AIChannels.RUNTIME_ASSISTANT_HISTORY, {
      conversationId: 'conversation-1',
    });
    expect(JSON.stringify(invoke.mock.calls)).not.toContain('identityId');
  });

  it('deletes the owner-scoped Mastra conversation over the canonical IPC channel', async () => {
    const invoke = vi.fn(async () => ok({ deleted: true }));
    const client = new AssistantRuntimeIpcClient({ invoke } as never);

    await expect(client.deleteConversation('conversation-1')).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith(AIChannels.RUNTIME_ASSISTANT_DELETE, {
      conversationId: 'conversation-1',
    });
    expect(JSON.stringify(invoke.mock.calls)).not.toContain('identityId');
  });

  it('subscribes to canonical push events and resolves only after a terminal runtime event', async () => {
    const { bridge, emit } = bridgeHarness();
    const invoke = vi.fn(
      async (channel: string, payload: { streamId?: string; command?: unknown }) => {
        if (channel === AIChannels.RUNTIME_ASSISTANT_START) {
          expect(JSON.stringify(payload.command)).not.toContain('identityId');
          void Promise.resolve().then(() => {
            emit(AIStreamChannels.RUNTIME_ASSISTANT_EVENT, {
              streamId: payload.streamId,
              event: started,
            });
            emit(AIStreamChannels.RUNTIME_ASSISTANT_EVENT, {
              streamId: payload.streamId,
              event: completed,
            });
          });
        }
        return ok(null);
      },
    );
    const client = new AssistantRuntimeIpcClient({
      invoke,
      getBridge: () => bridge,
    } as never);
    const events: unknown[] = [];

    await client.streamMessage(
      { ...command, surface: 'desktop' },
      { onEvent: (event) => events.push(event) },
    );

    expect(invoke).toHaveBeenCalledWith(
      AIChannels.RUNTIME_ASSISTANT_START,
      expect.objectContaining({
        command: { ...command, surface: 'desktop' },
      }),
    );
    expect(events).toEqual([started, completed]);
    expect(bridge.off).toHaveBeenCalledWith(
      AIStreamChannels.RUNTIME_ASSISTANT_EVENT,
      expect.any(Function),
    );
  });

  it('cancels by canonical runId command without exposing transport/session internals', async () => {
    const invoke = vi.fn(async () => ok({ cancelled: true }));
    const client = new AssistantRuntimeIpcClient({ invoke } as never);

    await expect(client.cancelRun('run-1')).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith(AIChannels.RUNTIME_ASSISTANT_CANCEL, {
      type: 'cancel_run',
      runId: 'run-1',
    });
  });

  it('fails closed when the IPC cancel result violates the runtime contract', async () => {
    const invoke = vi.fn(async () => ok({ cancelled: 'yes' }));
    const client = new AssistantRuntimeIpcClient({ invoke } as never);

    await expect(client.cancelRun('run-1')).rejects.toMatchObject({
      code: 'AI_RUNTIME_PROTOCOL_ERROR',
    });
  });
});
