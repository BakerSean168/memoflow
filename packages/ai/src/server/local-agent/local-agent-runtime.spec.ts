import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalAgentSqlite } from '../../testing/local-agent-sqlite';
import { LocalAgentRepository } from '../infrastructure/adapters/powersync/local-agent.repository';
import {
  LocalAgentRuntime,
  MEMOFLOW_NATIVE_TOOL_ROUTING_INSTRUCTIONS,
} from './local-agent-runtime';
import { LocalAgentError } from '../../shared/local-agent-error';
import { nativeIdentity, nativeModelVisibilityContext } from './native-identity';
import type { NativeAgentEvent, NativeAgentRunInput } from './codex-driver';

const ephemeralHomes: string[] = [];
const databases: ReturnType<typeof createLocalAgentSqlite>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  databases.splice(0).forEach((db) => db.close());
  await Promise.all(
    ephemeralHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});
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

it('defines a bounded native MemoFlow tool route without granting alternate automation paths', () => {
  expect(MEMOFLOW_NATIVE_TOOL_ROUTING_INSTRUCTIONS).toContain('goal_panel_open');
  expect(MEMOFLOW_NATIVE_TOOL_ROUTING_INSTRUCTIONS).toContain('goal_panel_submit');
  expect(MEMOFLOW_NATIVE_TOOL_ROUTING_INSTRUCTIONS).toContain('do not use goal_create');
  expect(MEMOFLOW_NATIVE_TOOL_ROUTING_INSTRUCTIONS).toContain('Never use shell');
  expect(MEMOFLOW_NATIVE_TOOL_ROUTING_INSTRUCTIONS).toContain('stop without retrying');
});

describe('AGY verified catalog reuse between Settings and Workspace', () => {
  it('reuses only the exact owner, revision and native OAuth identity without new ACP calls', async () => {
    const db = createLocalAgentSqlite();
    databases.push(db);
    const store = new LocalAgentRepository(db);
    const home = await mkdtemp(join(tmpdir(), 'mf-agy-catalog-proof-'));
    ephemeralHomes.push(home);
    const authDir = join(home, 'antigravity-acp');
    await mkdir(authDir, { recursive: true });
    await writeFile(
      join(authDir, 'settings.json'),
      JSON.stringify({ auth: { type: 'oauth-personal' } }),
    );
    const writeToken = (refresh: string) =>
      writeFile(
        join(authDir, 'acp_token.json'),
        JSON.stringify({ client_id: 'fixture-client', refresh_token: refresh }),
      );
    await writeToken('fixture-refresh-A');
    const connection = await store.createConnection('owner', {
      driver: 'antigravity',
      name: 'AGY',
      executablePath: '/fixture/agy_acp_server',
      homePath: home,
      enabled: true,
      writeScopes: [],
    });
    let probes = 0;
    const runtime = new LocalAgentRuntime({
      store,
      cwd: home,
      createDriver: (active) => ({
        async probe() {
          probes++;
          return {
            status: 'ready' as const,
            models: [{ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' }],
            modelVisibilityContext: nativeModelVisibilityContext(
              active,
              await nativeIdentity('antigravity', active.homePath),
            ),
          };
        },
        async *run(): AsyncGenerator<NativeAgentEvent> {
          throw new Error('Model listing must not send prompts');
        },
        respond: () => false,
        cancel() {},
        async close() {},
      }),
    });
    expect(await runtime.cachedCatalogConnection('owner', connection.id)).toBeNull();
    const live = await runtime.probeConnection('owner', connection.id);
    expect(live).toMatchObject({ status: 'ready', models: [{ id: 'gemini-3.8-flash' }] });
    expect(probes).toBe(1);
    expect(await runtime.cachedCatalogConnection('owner', connection.id)).toEqual(live);
    expect(await runtime.cachedCatalogConnection('different-owner', connection.id)).toBeNull();
    expect(probes).toBe(1);

    // T3-style snapshot survives an Electron process restart with zero new
    // PyInstaller launches, but never stores Google secrets or identity text.
    const files = await readdir(join(home, 'model-catalog'));
    expect(files).toHaveLength(1);
    const stored = await readFile(join(home, 'model-catalog', files[0]!), 'utf8');
    expect(stored).toContain('gemini-3.8-flash');
    expect(stored).not.toContain('fixture-refresh-A');
    expect(stored).not.toContain('fixture-client');
    const restarted = new LocalAgentRuntime({
      store,
      cwd: home,
      createDriver: () => {
        throw new Error('Snapshot read must not start ACP');
      },
    });
    expect(await restarted.cachedCatalogConnection('owner', connection.id)).toEqual(live);
    const conversation = await restarted.createConversation('owner', {
      connectionId: connection.id,
      modelId: 'gemini-3.8-flash',
      name: 'Hello',
    });
    expect(conversation.modelId).toBe('gemini-3.8-flash');
    await restarted.deleteConversation({ identityId: 'owner', conversationId: conversation.id });
    await restarted.dispose();
    expect(probes).toBe(1);

    // A native token/account rotation instantly invalidates the proof.
    await writeToken('fixture-refresh-B');
    expect(await runtime.cachedCatalogConnection('owner', connection.id)).toBeNull();
    await runtime.probeConnection('owner', connection.id);
    expect(probes).toBe(2);
    expect(await runtime.cachedCatalogConnection('owner', connection.id)).toMatchObject({
      status: 'ready',
      models: [{ id: 'gemini-3.8-flash' }],
    });

    // A saved configuration revision is a different authority even on the same Home.
    await runtime.saveConnection(
      'owner',
      {
        driver: 'antigravity',
        name: 'AGY edited',
        executablePath: '/fixture/agy_acp_server',
        homePath: home,
        enabled: true,
        writeScopes: [],
      },
      connection.id,
      connection.revision,
    );
    expect(await runtime.cachedCatalogConnection('owner', connection.id)).toBeNull();
    // Commands creating a native conversation still invoke a *fresh* probe.
    await runtime.probeConnection('owner', connection.id);
    expect(probes).toBe(3);
    await runtime.deleteConnection('owner', connection.id);
    expect(await runtime.cachedCatalogConnection('owner', connection.id)).toBeNull();
    await runtime.dispose();
  });
});

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

  it('rejects unadvertised effort or tier before starting a native turn, but forwards accepted options', async () => {
    const { store, conversation } = await setup();
    const runs: NativeAgentRunInput[] = [];
    const runtime = new LocalAgentRuntime({
      store,
      cwd: '/tmp',
      createDriver: () => ({
        async *run(input: NativeAgentRunInput): AsyncGenerator<NativeAgentEvent> {
          runs.push(input);
          yield { type: 'completed' };
        },
        respond: () => false,
        cancel() {},
        async close() {},
        async probe() {
          return {
            status: 'ready' as const,
            models: [
              {
                id: 'model',
                name: 'Model',
                reasoningEfforts: ['low', 'high'],
                serviceTiers: [{ id: 'priority', name: 'Fast' }],
              },
            ],
          };
        },
      }),
    });
    for (const modelOptions of [{ reasoningEffort: 'unavailable' }, { serviceTier: 'unknown' }]) {
      await expect(
        runtime
          .dispatchMessage({
            identityId: 'owner',
            conversationId: conversation.id,
            content: 'Hi',
            modelOptions,
          })
          .next(),
      ).rejects.toMatchObject({ code: 'LOCAL_AGENT_MODEL_UNSUPPORTED' });
    }
    for await (const _event of runtime.dispatchMessage({
      identityId: 'owner',
      conversationId: conversation.id,
      content: 'Hi',
      modelOptions: { reasoningEffort: 'high', serviceTier: 'priority' },
    })) {
    }
    expect(runs).toHaveLength(1);
    expect(runs[0]?.modelOptions).toEqual({ reasoningEffort: 'high', serviceTier: 'priority' });
    await runtime.dispose();
  });

  it('changes model within one native conversation and snapshots each turn model', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
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
    expect(history.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
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
    for (const driver of ['codex', 'claude', 'pi', 'dsh', 'antigravity'] as const) {
      await expect(runtime.probeDefaultDriver('owner', driver)).resolves.toMatchObject({
        status: 'ready',
        models: [{ id: 'model' }],
      });
    }
    expect(observed.map((item) => item.executablePath)).toEqual([
      'codex',
      'claude',
      'pi',
      'dsh',
      'agy_acp_server',
    ]);
    expect(observed.every((item) => item.writeScopes.length === 0)).toBe(true);
    expect(getConnection).not.toHaveBeenCalled();
    expect(createConnection).not.toHaveBeenCalled();
    expect(await store.listConnections('owner')).toHaveLength(0);
    expect(close).toHaveBeenCalledTimes(5);
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
    const created = await runtime.createConversation('owner', {
      connectionId: conversation.connectionId,
      modelId: 'model',
      name: 'New conversation',
    });
    expect(created).not.toHaveProperty('historyOrderVersion');
    expect((await store.getConversation('owner', created.id)).historyOrderVersion).toBe(1);
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

it.each(['LOCAL_AGENT_RATE_LIMITED', 'LOCAL_AGENT_QUOTA_EXHAUSTED'] as const)(
  'retains %s separately from discovery and fences it by instance/account until a successful request',
  async (code) => {
    const { store, conversation } = await setup();
    const connection = await store.getConnection('owner', conversation.connectionId);
    let fingerprint = 'a'.repeat(64);
    let fail = true;
    const runtime = new LocalAgentRuntime({
      store,
      cwd: '/tmp',
      createDriver: (current) => ({
        async probe() {
          return {
            status: 'ready' as const,
            models: [{ id: 'model', name: 'Model' }],
            modelVisibilityContext: nativeModelVisibilityContext(current, fingerprint),
          };
        },
        async *run(): AsyncGenerator<NativeAgentEvent> {
          yield {
            type: 'session',
            nativeSessionId: 'fixture-session',
            accountFingerprint: fingerprint,
          };
          if (fail) throw new LocalAgentError(code);
          yield { type: 'completed' };
        },
        respond: () => false,
        cancel() {},
        async close() {},
      }),
    });
    expect(await runtime.probeConnection('owner', connection.id)).not.toHaveProperty(
      'lastExecutionFailure',
    );
    const events = [];
    for await (const event of runtime.dispatchMessage({
      identityId: 'owner',
      conversationId: conversation.id,
      content: 'Keep my prompt',
    }))
      events.push(event);
    expect(events.at(-1)).toMatchObject({ type: 'assistant.run.failed', data: { code } });
    const status = await runtime.probeConnection('owner', connection.id);
    expect(status).toMatchObject({
      status: 'ready',
      models: [{ id: 'model' }],
      lastExecutionFailure: { code, modelId: 'model', occurredAt: expect.any(Number) },
    });
    // Another connection, even with the same native Home/account, owns its own request result.
    const other = await store.createConnection('owner', {
      driver: 'codex',
      name: 'Other',
      executablePath: connection.executablePath,
      enabled: true,
      writeScopes: [],
    });
    expect(await runtime.probeConnection('owner', other.id)).not.toHaveProperty(
      'lastExecutionFailure',
    );
    fingerprint = 'b'.repeat(64);
    expect(await runtime.probeConnection('owner', connection.id)).not.toHaveProperty(
      'lastExecutionFailure',
    );
    fingerprint = 'a'.repeat(64);
    expect(await runtime.probeConnection('owner', connection.id)).toHaveProperty(
      'lastExecutionFailure',
    );
    fail = false;
    for await (const _event of runtime.dispatchMessage({
      identityId: 'owner',
      conversationId: conversation.id,
      content: 'Explicit retry',
    })) {
    }
    expect(await runtime.probeConnection('owner', connection.id)).not.toHaveProperty(
      'lastExecutionFailure',
    );
    expect((await store.getConversation('owner', conversation.id)).modelId).toBe('model');
    expect(
      (await store.listMessages('owner', conversation.id)).messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content),
    ).toEqual(['Keep my prompt', 'Explicit retry']);
    await runtime.dispose();
  },
);

it('keeps Google sign-in guidance when conversation creation rejects a logged-out AGY connection', async () => {
  const { store } = await setup();
  const connection = await store.createConnection('owner', {
    driver: 'antigravity',
    name: 'AGY',
    executablePath: '/fake/agy',
    enabled: true,
    writeScopes: [],
  });
  const runtime = new LocalAgentRuntime({
    store,
    cwd: '/tmp',
    createDriver: () => ({
      async *run(): AsyncGenerator<NativeAgentEvent> {
        yield { type: 'completed' };
      },
      respond: () => false,
      cancel() {},
      async close() {},
      async probe() {
        return { status: 'login_required' as const, message: 'Google sign-in' };
      },
    }),
  });
  await expect(
    runtime.createConversation('owner', {
      connectionId: connection.id,
      modelId: 'model',
      name: 'Chat',
    }),
  ).rejects.toMatchObject({
    code: 'LOCAL_AGENT_LOGIN_REQUIRED',
    message:
      'Google sign-in is required. Open Settings → AI → Providers → Antigravity and select “Sign in with Google”.',
  });
});

it('fails with LOCAL_AGENT_TOOLS_UNAVAILABLE when business tools are missing on verified bridge', async () => {
  const { store } = await setup();
  const connection = await store.createConnection('owner', {
    driver: 'codex',
    name: 'Codex',
    executablePath: '/fake/codex',
    enabled: true,
    writeScopes: ['goals:write'],
  });
  const runtime = new LocalAgentRuntime({
    store,
    cwd: '/tmp',
    bridge: {
      async open() {
        return {
          url: 'http://127.0.0.1:9999/mcp',
          token: 'token',
          revoke: () => {},
        };
      },
      async dispose() {},
    },
    createDriver: () => ({
      async *run(): AsyncGenerator<NativeAgentEvent> {
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

  const conversation = await runtime.createConversation('owner', {
    connectionId: connection.id,
    modelId: 'model',
    name: 'Chat',
  });

  const events: any[] = [];
  for await (const event of runtime.dispatchMessage({
    identityId: 'owner',
    conversationId: conversation.id,
    content: 'Hello',
  })) {
    events.push(event);
  }

  const failed = events.find((e) => e.type === 'assistant.run.failed');
  expect(failed).toBeDefined();
  expect(failed.data.code).toBe('LOCAL_AGENT_TOOLS_UNAVAILABLE');
  await runtime.dispose();
});

it('deduplicates identical native permission prompts and does not re-ask a declined capability in the same run', async () => {
  const { store, conversation } = await setup();
  const respond = vi.fn((requestId: string) => {
    if (requestId === 'permission-1') releaseFirst();
    return true;
  });
  let releaseFirst: () => void = () => {};
  const firstAnswered = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const runtime = new LocalAgentRuntime({
    store,
    cwd: '/tmp',
    createDriver: () => ({
      async *run(): AsyncGenerator<NativeAgentEvent> {
        const permission = (requestId: string, title: string) => ({
          type: 'request' as const,
          request: {
            type: 'permission' as const,
            requestId,
            title,
            reason: 'The Agent wants to run tests',
            scope: 'execute · /repo',
          },
        });
        yield permission('permission-1', 'Run npm test');
        // Provider repeats the same capability before the user answered.
        yield permission('permission-2', 'Run npm test');
        await firstAnswered;
        yield { type: 'request_resolved', requestId: 'permission-1', resolution: 'answered' };
        yield { type: 'request_resolved', requestId: 'permission-2', resolution: 'answered' };
        // And asks for it again after the decline: no new card, a readable denial instead.
        yield permission('permission-3', 'Run npm test');
        // A different capability is still asked normally.
        yield permission('permission-4', 'Write README.md');
        yield { type: 'completed' };
      },
      respond,
      cancel() {},
      async close() {},
      async probe() {
        return { status: 'ready' as const, models: [{ id: 'model', name: 'Model' }] };
      },
    }),
  });
  const events: any[] = [];
  for await (const event of runtime.dispatchMessage({
    identityId: 'owner',
    conversationId: conversation.id,
    content: 'Run the tests',
  })) {
    events.push(event);
    if (event.type === 'assistant.request.required' && event.data.requestId === 'permission-1') {
      expect(event.data).toMatchObject({
        reason: 'The Agent wants to run tests',
        scope: 'execute · /repo',
      });
      expect(
        runtime.respond('owner', {
          conversationId: conversation.id,
          runId: event.runId,
          requestId: 'permission-1',
          response: { type: 'permission', decision: 'decline' },
        }),
      ).toBe(true);
    }
  }
  const prompted = events
    .filter((event) => event.type === 'assistant.request.required')
    .map((event) => event.data.requestId);
  expect(prompted).toEqual(['permission-1', 'permission-4']);
  expect(respond.mock.calls).toEqual([
    ['permission-1', { type: 'permission', decision: 'decline' }],
    ['permission-2', { type: 'permission', decision: 'decline' }],
    ['permission-3', { type: 'permission', decision: 'decline' }],
  ]);
  expect(
    events
      .filter((event) => event.type === 'assistant.request.resolved')
      .map((event) => event.data.requestId),
  ).toEqual(['permission-1']);
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'assistant.activity',
      data: expect.objectContaining({
        toolCallId: 'permission:permission-3',
        label: 'Run npm test',
        state: 'denied',
      }),
    }),
  );
  await runtime.dispose();
});

it('sends the tool route only to the Provider and revokes the per-run MCP grant on completion and cancel', async () => {
  const { store } = await setup();
  const connection = await store.createConnection('owner', {
    driver: 'codex',
    name: 'Codex',
    executablePath: '/fake/codex',
    enabled: true,
    writeScopes: [],
  });
  const revoked: string[] = [];
  let opened = 0;
  let cancelTurn: (() => void) | undefined;
  const providerContents: string[] = [];
  const runtime = new LocalAgentRuntime({
    store,
    cwd: '/tmp',
    bridge: {
      async open() {
        const token = `token-${++opened}`;
        // Non-HTTP test transport: skips the live MCP connectivity probe.
        return { url: 'memoflow-test://mcp', token, revoke: () => revoked.push(token) };
      },
      async dispose() {},
    },
    createDriver: () => ({
      async *run(input: NativeAgentRunInput): AsyncGenerator<NativeAgentEvent> {
        providerContents.push(input.content);
        if (input.content.includes('slow')) {
          await new Promise<void>((resolve) => {
            cancelTurn = resolve;
          });
          return;
        }
        yield { type: 'completed' };
      },
      respond: () => false,
      cancel() {
        cancelTurn?.();
      },
      async close() {},
      async probe() {
        return { status: 'ready' as const, models: [{ id: 'model', name: 'Model' }] };
      },
    }),
  });
  const conversation = await runtime.createConversation('owner', {
    connectionId: connection.id,
    modelId: 'model',
    name: 'Chat',
  });
  for await (const _event of runtime.dispatchMessage({
    identityId: 'owner',
    conversationId: conversation.id,
    content: 'Hello',
  }));
  expect(revoked).toContain('token-1');
  expect(providerContents[0]).toContain(MEMOFLOW_NATIVE_TOOL_ROUTING_INSTRUCTIONS);
  const history = await store.listMessages('owner', conversation.id);
  expect(history.messages[0]).toMatchObject({ role: 'user', content: 'Hello' });

  const slow = runtime.dispatchMessage({
    identityId: 'owner',
    conversationId: conversation.id,
    content: 'slow',
  });
  const started = await slow.next();
  expect(started.value).toMatchObject({ type: 'assistant.run.started' });
  expect(
    runtime.cancelRun({ identityId: 'owner', runId: (started.value as { runId: string }).runId }),
  ).toBe(true);
  for await (const _event of slow);
  expect(revoked).toContain('token-2');
  await runtime.dispose();
});
