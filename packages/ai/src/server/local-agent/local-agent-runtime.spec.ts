import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalAgentSqlite } from '../../testing/local-agent-sqlite';
import { LocalAgentRepository } from '../infrastructure/adapters/powersync/local-agent.repository';
import { LocalAgentRuntime } from './local-agent-runtime';
import type { NativeAgentEvent, NativeAgentRunInput } from './codex-driver';

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
  it.each(['supervised', 'auto-approve'] as const)(
    'enforces per-turn %s native permission choices without granting new write scopes',
    async (permissionMode) => {
      const { store, conversation } = await setup();
      const respond = vi.fn(() => true);
      const runtime = new LocalAgentRuntime({
        store,
        cwd: '/tmp',
        createDriver: () => ({
          async *run(): AsyncGenerator<NativeAgentEvent> {
            yield {
              type: 'request',
              request: { type: 'permission', requestId: 'permission-1', title: 'Run command' },
            };
            yield {
              type: 'request',
              request: {
                type: 'user_input',
                requestId: 'question-1',
                questions: [{ id: 'q', prompt: 'Which branch?', options: ['main', 'dev'] }],
              },
            };
            yield { type: 'completed' };
          },
          respond,
          cancel() {},
          async close() {},
          async probe() {
            return { status: 'ready' as const, models: [] };
          },
        }),
      });
      const events = [];
      for await (const event of runtime.dispatchMessage({
        identityId: 'owner',
        conversationId: conversation.id,
        content: 'Proceed',
        permissionMode,
      }))
        events.push(event);
      if (permissionMode === 'auto-approve') {
        expect(respond).toHaveBeenCalledOnce();
        expect(respond).toHaveBeenCalledWith('permission-1', {
          type: 'permission',
          decision: 'approve_once',
        });
        expect(
          events.some(
            (event) =>
              event.type === 'assistant.request.required' &&
              event.data.requestId === 'permission-1',
          ),
        ).toBe(false);
      } else {
        expect(respond).not.toHaveBeenCalled();
        expect(
          events.some(
            (event) =>
              event.type === 'assistant.request.required' &&
              event.data.requestId === 'permission-1',
          ),
        ).toBe(true);
      }
      expect(
        events.some(
          (event) =>
            event.type === 'assistant.request.required' && event.data.requestId === 'question-1',
        ),
      ).toBe(true);
      expect((await store.listConnections('owner'))[0].writeScopes).toEqual([]);
      await expect(
        runtime
          .dispatchMessage({
            identityId: 'owner',
            conversationId: conversation.id,
            content: 'Read',
            permissionMode: 'read-only',
          })
          .next(),
      ).rejects.toMatchObject({ code: 'LOCAL_AGENT_PERMISSION_DENIED' });
      await runtime.dispose();
    },
  );

  it('changes model within one native conversation and snapshots each turn model', async () => {
    const { store, conversation } = await setup();
    const runs: NativeAgentRunInput[] = [];
    const runtime = new LocalAgentRuntime({
      store,
      cwd: '/tmp',
      createDriver: () => ({
        async *run(input: NativeAgentRunInput): AsyncGenerator<NativeAgentEvent> {
          runs.push(input);
          yield {
            type: 'session',
            nativeSessionId: 'same-native-session',
            accountFingerprint: 'account',
          };
          yield { type: 'delta', content: input.modelId };
          yield { type: 'completed' };
        },
        respond: () => false,
        cancel() {},
        async close() {},
        async probe() {
          return { status: 'ready' as const, models: [] };
        },
      }),
    });
    for (const modelId of ['model', 'second-model']) {
      const events = [];
      for await (const event of runtime.dispatchMessage({
        identityId: 'owner',
        conversationId: conversation.id,
        content: 'Hi',
        modelId,
      }))
        events.push(event);
      expect(events.at(-1)?.type).toBe('assistant.run.completed');
    }
    expect(runs[1]).toMatchObject({
      nativeSessionId: 'same-native-session',
      modelId: 'second-model',
    });
    expect((await store.getConversation('owner', conversation.id)).modelId).toBe('second-model');
    const history = await store.listMessages('owner', conversation.id);
    expect(
      history.messages
        .filter((m) => m.role === 'assistant')
        .map((m) => m.localAgentSource?.modelId),
    ).toEqual(['model', 'second-model']);
    await runtime.dispose();
  });
  it('keeps text already shown to the user when a running turn is cancelled', async () => {
    const { store, conversation } = await setup();
    const runtime = new LocalAgentRuntime({
      store,
      cwd: '/tmp',
      createDriver: () => ({
        async *run(): AsyncGenerator<NativeAgentEvent> {
          yield { type: 'delta', content: 'Accepted partial answer' };
          yield { type: 'delta', content: 'Late answer must be ignored' };
        },
        respond: () => false,
        cancel() {},
        async close() {},
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
    const started = await stream.next();
    expect((await stream.next()).value).toMatchObject({ type: 'assistant.message.delta' });
    if (!started.value) throw new Error('Missing run');
    runtime.cancelRun({ identityId: 'owner', runId: started.value.runId });
    expect((await stream.next()).value).toMatchObject({ type: 'assistant.run.cancelled' });
    await stream.return();
    const history = await store.listMessages('owner', conversation.id);
    expect(history.incomplete).toBe(true);
    expect(history.messages.at(-1)?.content).toBe('Accepted partial answer');
    await runtime.dispose();
  });
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
  it('probes the implicit native driver without persisting a connection or running inference', async () => {
    const db = createLocalAgentSqlite();
    databases.push(db);
    const store = new LocalAgentRepository(db);
    const getConnection = vi.spyOn(store, 'getConnection');
    const createConnection = vi.spyOn(store, 'createConnection');
    const observed: { driver: string; executablePath: string; writeScopes: string[] }[] = [];
    const close = vi.fn(async () => {});
    const runtime = new LocalAgentRuntime({
      store,
      cwd: '/tmp',
      createDriver: (connection) => {
        observed.push(connection);
        return {
          async probe() {
            return { status: 'ready' as const, models: [{ id: 'model', name: 'Model' }] };
          },
          async *run(): AsyncGenerator<NativeAgentEvent> {
            throw new Error('Probe must not run native inference');
          },
          respond: () => false,
          cancel() {},
          close,
        };
      },
    });
    for (const driver of ['codex', 'claude', 'pi', 'dsh'] as const) {
      await expect(runtime.probeDefaultDriver('owner', driver)).resolves.toMatchObject({
        status: 'ready',
        models: [{ id: 'model' }],
      });
    }
    expect(observed.map((item) => item.executablePath)).toEqual(['codex', 'claude', 'pi', 'dsh']);
    expect(observed.every((item) => item.writeScopes.length === 0)).toBe(true);
    expect(getConnection).not.toHaveBeenCalled();
    expect(createConnection).not.toHaveBeenCalled();
    expect(await store.listConnections('owner')).toHaveLength(0);
    expect(close).toHaveBeenCalledTimes(4);
    await runtime.dispose();
  });

  it('isolates unsaved probes from a closed Profile and rejects unknown drivers', async () => {
    const db = createLocalAgentSqlite();
    databases.push(db);
    const store = new LocalAgentRepository(db);
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const close = vi.fn(async () => {});
    const runtime = new LocalAgentRuntime({
      store,
      cwd: '/tmp',
      createDriver: () => ({
        async probe() {
          started();
          await wait;
          return { status: 'ready' as const, models: [] };
        },
        async *run(): AsyncGenerator<NativeAgentEvent> {
          throw new Error('not expected');
        },
        respond: () => false,
        cancel() {
          release();
        },
        close,
      }),
    });
    await expect(runtime.probeDefaultDriver('owner', 'mastra' as never)).rejects.toMatchObject({
      code: 'LOCAL_AGENT_UNAVAILABLE',
    });
    const pending = runtime.probeDefaultDriver('owner', 'codex');
    await entered;
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'LOCAL_AGENT_PERMISSION_DENIED',
    });
    await runtime.dispose();
    await rejection;
    expect(close).toHaveBeenCalled();
    expect(await store.listConnections('owner')).toHaveLength(0);
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
