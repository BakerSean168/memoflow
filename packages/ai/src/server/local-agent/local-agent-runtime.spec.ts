import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalAgentSqlite } from '../../testing/local-agent-sqlite';
import { LocalAgentRepository } from '../infrastructure/adapters/powersync/local-agent.repository';
import { LocalAgentRuntime } from './local-agent-runtime';
import type { NativeAgentEvent } from './codex-driver';

const databases: ReturnType<typeof createLocalAgentSqlite>[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
async function setup() {
  const db = createLocalAgentSqlite();
  databases.push(db);
  const store = new LocalAgentRepository(db);
  const connection = await store.createConnection('owner', {
    driver: 'codex',
    name: 'Codex',
    executablePath: '/fake/codex',
    enabled: true,
    writeScopes: [],
  });
  const conversation = await store.createConversation('owner', {
    connectionId: connection.id,
    modelId: 'model',
    name: 'Chat',
  });
  return { store, conversation };
}

describe('local Agent conversation execution', () => {
  it('waits for an in-flight Profile database read and rejects its stale result during teardown', async () => {
    const { store } = await setup();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(store, 'listConnections').mockImplementation(async () => {
      await wait;
      return [];
    });
    const runtime = new LocalAgentRuntime({ store, cwd: '/tmp' });
    const read = runtime.listConnections('owner');
    const rejected = expect(read).rejects.toMatchObject({ code: 'LOCAL_AGENT_PERMISSION_DENIED' });
    let disposed = false;
    const disposal = runtime.dispose().then(() => {
      disposed = true;
    });
    await Promise.resolve();
    expect(disposed).toBe(false);
    release();
    await rejected;
    await disposal;
    expect(disposed).toBe(true);
  });
  it('reserves probe capacity before asynchronous connection lookup', async () => {
    const { store, conversation } = await setup();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    const runtime = new LocalAgentRuntime({
      store,
      cwd: '/tmp',
      createDriver: () => ({
        async probe() {
          started++;
          await wait;
          return { status: 'ready' as const, models: [] };
        },
        async *run(): AsyncGenerator<NativeAgentEvent> {
          yield { type: 'completed' };
        },
        respond: () => false,
        cancel() {
          release();
        },
        async close() {
          release();
        },
      }),
    });
    const probes = Array.from({ length: 4 }, () =>
      runtime.probeConnection('owner', conversation.connectionId),
    );
    await expect(runtime.probeConnection('owner', conversation.connectionId)).rejects.toMatchObject(
      { code: 'CONFLICT' },
    );
    release();
    await Promise.all(probes);
    expect(started).toBe(4);
    await runtime.dispose();
  });
  it('disposes native resources even when the consumer has paused at a yielded event', async () => {
    const { store, conversation } = await setup();
    let closed = false;
    let entered = false;
    const runtime = new LocalAgentRuntime({
      store,
      cwd: '/tmp',
      createDriver: () => ({
        async *run(): AsyncGenerator<NativeAgentEvent> {
          entered = true;
          yield { type: 'completed' };
        },
        respond: () => false,
        cancel() {},
        async close() {
          closed = true;
        },
        async probe() {
          return { status: 'ready' as const, models: [] };
        },
      }),
    });
    const stream = runtime.dispatchMessage({
      identityId: 'owner',
      conversationId: conversation.id,
      content: 'Hello',
    });
    await stream.next();
    await runtime.dispose();
    expect(closed).toBe(true);
    await stream.next();
    expect(entered).toBe(false);
    await stream.return();
  }, 1000);
  it('persists its native binding and display history without another execution owner', async () => {
    const { store, conversation } = await setup();
    const runtime = new LocalAgentRuntime({
      store,
      cwd: '/tmp',
      createDriver: () => ({
        async *run(): AsyncGenerator<NativeAgentEvent> {
          yield { type: 'session', nativeSessionId: 'native', accountFingerprint: 'account' };
          yield {
            type: 'activity',
            toolCallId: 'goal-read',
            label: 'goal_search',
            state: 'running',
          };
          yield {
            type: 'activity',
            toolCallId: 'goal-read',
            label: 'goal_search',
            state: 'completed',
          };
          yield { type: 'delta', content: 'Answer' };
          yield { type: 'completed' };
        },
        respond: () => false,
        cancel() {},
        async close() {},
        async probe() {
          return { status: 'ready' as const, models: [{ id: 'model', name: 'Model' }] };
        },
      }),
    });
    const events = [];
    for await (const event of runtime.dispatchMessage({
      identityId: 'owner',
      conversationId: conversation.id,
      content: 'Hello',
    }))
      events.push(event);
    expect(events.map((event) => event.type)).toEqual([
      'assistant.run.started',
      'assistant.activity',
      'assistant.activity',
      'assistant.message.delta',
      'assistant.run.completed',
    ]);
    expect((await store.getConversation('owner', conversation.id)).nativeSessionId).toBe('native');
    expect(
      (
        await runtime.listMessages({ identityId: 'owner', conversationId: conversation.id })
      ).messages.map((item) => item.content),
    ).toEqual(['Hello', 'Answer']);
    expect((await store.listMessages('owner', conversation.id)).messages[1]).toMatchObject({
      nativeActivities: [{ toolCallId: 'goal-read', label: 'goal_search', state: 'completed' }],
    });
    await expect(
      runtime.listMessages({ identityId: 'other', conversationId: conversation.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await runtime.dispose();
  });

  it('rejects concurrent sends and old Profile calls while cancellation retains incomplete history', async () => {
    const { store, conversation } = await setup();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = true;
    const runtime = new LocalAgentRuntime({
      store,
      cwd: '/tmp',
      isActive: () => active,
      createDriver: () => ({
        async *run(): AsyncGenerator<NativeAgentEvent> {
          await wait;
          yield { type: 'cancelled' };
        },
        cancel: release,
        async close() {
          release();
        },
        respond: () => false,
        async probe() {
          return { status: 'ready' as const, models: [] };
        },
      }),
    });
    const input = { identityId: 'owner', conversationId: conversation.id, content: 'Hello' };
    const first = runtime.dispatchMessage(input);
    const started = await first.next();
    expect(started.value).toMatchObject({ type: 'assistant.run.started' });
    await expect(runtime.dispatchMessage(input).next()).rejects.toMatchObject({ code: 'CONFLICT' });
    const drain = (async () => {
      for await (const _event of first) {
        /* consume terminal */
      }
    })();
    active = false;
    await runtime.dispose();
    await drain;
    await expect(
      runtime.listMessages({ identityId: 'owner', conversationId: conversation.id }),
    ).rejects.toMatchObject({ code: 'LOCAL_AGENT_PERMISSION_DENIED' });
    expect((await store.listMessages('owner', conversation.id)).incomplete).toBe(true);
  });
});
