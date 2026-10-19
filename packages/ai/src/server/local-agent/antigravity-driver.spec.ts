import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { LocalAgentConnection } from '@memoflow/contracts/ai';
import { LocalAgentStatusSchema } from '@memoflow/contracts/ai';
import { AcpDriver } from './acp-driver';
import type { NativeAgentEvent } from './codex-driver';
import type { NativeProcessOptions, NativeRpcTransport } from './native-rpc-transport';
import { nativeIdentity, nativeModelVisibilityContext } from './native-identity';
import { LocalAgentError, type LocalAgentFailureCode } from '../../shared/local-agent-error';

const temporaryPreflight = vi.hoisted(() => ({
  onCreated: undefined as ((directory: string) => void) | undefined,
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...original,
    mkdtemp: async (prefix: string) => {
      const directory = await original.mkdtemp(prefix);
      if (prefix.endsWith('mf-agy-')) temporaryPreflight.onCreated?.(directory);
      return directory;
    },
  };
});

const homes: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  temporaryPreflight.onCreated = undefined;
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

class FakeAntigravity {
  calls: Array<{ method: string; params: unknown }> = [];
  responses: Array<{ id: string | number; result: unknown }> = [];
  notifications: Array<{ method: string; params: unknown }> = [];
  onNotification?: (method: string, params: unknown) => void;
  onRequest?: (request: { id: string | number; method: string; params: unknown }) => void;
  onFailure?: (error: LocalAgentError) => void;
  closed = false;
  mode = 'default';
  legacyModels = false;
  rejectsSelection = false;
  current = 'flash-high';
  failure?: LocalAgentFailureCode;
  ask?: 'permission' | 'question';
  private settle?: () => void;
  constructor(readonly options: NativeProcessOptions) {}
  state() {
    return {
      sessionId: 'agy-session',
      modes: { currentModeId: this.mode, availableModes: [{ id: 'default' }, { id: 'yolo' }] },
      ...(this.legacyModels
        ? {
            models: {
              currentModelId: this.current,
              availableModels: [
                { modelId: 'flash-high', name: 'Flash High' },
                { modelId: 'flash-low', name: 'Flash Low' },
              ],
            },
          }
        : {
            configOptions: [
              {
                id: 'model',
                category: 'model',
                type: 'select',
                currentValue: this.current,
                options: [
                  { value: 'flash-high', name: 'Flash High' },
                  { value: 'flash-low', name: 'Flash Low' },
                ],
              },
            ],
          }),
    };
  }
  async request(method: string, params: unknown): Promise<unknown> {
    this.calls.push({ method, params });
    if (method === 'initialize')
      return {
        protocolVersion: 1,
        agentInfo: { name: 'antigravity-acp', version: 'agy_acp_server_1.4.0' },
        agentCapabilities: { mcpCapabilities: { http: true }, sessionCapabilities: { resume: {} } },
      };
    if (method === 'authenticate') return {};
    if (method === 'session/new' || method === 'session/resume') return this.state();
    if (method === 'session/set_mode') {
      this.mode = (params as { modeId: string }).modeId;
      return {};
    }
    if (method === 'session/set_config_option') {
      if (!this.rejectsSelection) this.current = (params as { value: string }).value;
      return this.state();
    }
    if (method === 'session/set_model') {
      this.current = (params as { modelId: string }).modelId;
      return {};
    }
    if (method === 'session/close') return {};
    if (method === 'session/prompt') {
      if (this.failure) throw new LocalAgentError(this.failure);
      if (this.ask) {
        const waiting = new Promise<void>((resolve) => {
          this.settle = resolve;
        });
        this.onRequest?.({
          id: 42,
          method: 'session/request_permission',
          params: {
            sessionId: 'agy-session',
            toolCall: {
              toolCallId: this.ask === 'question' ? 'interaction_destination' : 'tool-write',
              title: 'Choose once',
            },
            options: [
              { optionId: 'yes', name: 'Yes', kind: 'allow_once' },
              { optionId: 'no', name: 'No', kind: 'reject_once' },
            ],
          },
        });
        await waiting;
      }
      this.onNotification?.('session/update', {
        sessionId: 'agy-session',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Fixture response' },
        },
      });
      return { stopReason: 'end_turn' };
    }
    throw new Error('Unexpected fixture method');
  }
  respond(id: string | number, result: unknown) {
    this.responses.push({ id, result });
    this.settle?.();
  }
  notify(method: string, params: unknown) {
    this.notifications.push({ method, params });
  }
  rejectRequest(id: string | number) {
    this.responses.push({ id, result: 'rejected' });
  }
  async close() {
    this.closed = true;
    this.settle?.();
  }
}

async function setup(configure: (transport: FakeAntigravity) => void = () => {}) {
  const home = await mkdtemp(join(tmpdir(), 'memoflow-agy-test-'));
  homes.push(home);
  await mkdir(join(home, 'antigravity-acp'));
  // Synthetic native authorization cache; only its bounded identity digest is used.
  await writeFile(
    join(home, 'antigravity-acp', 'acp_token.json'),
    JSON.stringify({ client_id: 'fixture-client', refresh_token: 'offline-fixture' }),
  );
  const executable = join(home, 'agy-fixture.cjs');
  await writeFile(executable, '// Test-owned placeholder, never launched');
  const connection: LocalAgentConnection = {
    id: 'agy',
    driver: 'antigravity',
    name: 'AGY',
    executablePath: executable,
    homePath: home,
    enabled: true,
    writeScopes: [],
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  const transports: FakeAntigravity[] = [];
  const make = (input = connection) =>
    new AcpDriver(input, home, (options) => {
      const transport = new FakeAntigravity(options);
      configure(transport);
      transports.push(transport);
      return transport as unknown as NativeRpcTransport;
    });
  return { home, connection, transports, make };
}
async function collect(driver: AcpDriver, modelId = 'flash-low', extras = {}) {
  const events: NativeAgentEvent[] = [];
  for await (const event of driver.run({ content: 'Offline acceptance', modelId, ...extras }))
    events.push(event);
  return events;
}

it('loads cached native OAuth before discovering actual models without inference or secret projection', async () => {
  const fixture = await setup();
  const status = LocalAgentStatusSchema.parse(await fixture.make().probe());
  expect(status).toMatchObject({
    status: 'ready',
    version: '1.4.0',
    models: [
      { id: 'flash-high', name: 'Flash High' },
      { id: 'flash-low', name: 'Flash Low' },
    ],
    modelVisibilityContext: nativeModelVisibilityContext(
      fixture.connection,
      await nativeIdentity('antigravity', fixture.home),
    ),
  });
  expect(status).not.toHaveProperty('account');
  expect(JSON.stringify(status)).not.toContain(fixture.home);
  expect(JSON.stringify(status)).not.toContain('offline-fixture');
  const transport = fixture.transports[0];
  expect(transport.calls.map((call) => call.method)).toEqual([
    'initialize',
    'authenticate',
    'session/new',
    'session/close',
  ]);
  expect(transport.calls[1].params).toEqual({ methodId: 'oauth-personal' });
  expect(transport.options.args).toEqual(process.platform === 'linux' ? ['--uid='] : []);
  expect(transport.options.env?.GEMINI_HOME).toBe(fixture.home);
  expect(transport.options.driver).toBe('antigravity');
  expect(transport.closed).toBe(true);
  expect(existsSync((transport.options.env?.TMPDIR ?? transport.options.env?.TEMP)!)).toBe(false);
});

it('does not inherit alternative API credentials or route selection into cached OAuth discovery', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'PRIVATE_KEY');
  vi.stubEnv('GOOGLE_API_KEY', 'PRIVATE_GOOGLE_KEY');
  vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '/private/cloud.json');
  const fixture = await setup();
  await fixture.make().probe();
  const env = fixture.transports[0].options.env!;
  expect(env).not.toHaveProperty('GEMINI_API_KEY');
  expect(env).not.toHaveProperty('GOOGLE_API_KEY');
  expect(env).not.toHaveProperty('GOOGLE_APPLICATION_CREDENTIALS');
  expect(env.BROWSER).toContain('process.exit(0)');
});

it('reports missing login without launching a native process or opening a browser', async () => {
  const fixture = await setup();
  await rm(join(fixture.home, 'antigravity-acp', 'acp_token.json'));
  expect(await fixture.make().probe()).toMatchObject({ status: 'login_required' });
  expect(fixture.transports).toHaveLength(0);
});

it('reports a missing ACP executable rather than treating the separate agy CLI as usable', async () => {
  const fixture = await setup();
  expect(
    await fixture
      .make({ ...fixture.connection, executablePath: join(fixture.home, 'missing') })
      .probe(),
  ).toMatchObject({ status: 'not_installed' });
  expect(fixture.transports).toHaveLength(0);
});

it('selects only an advertised model and emits stream/completion through the shared ACP lifecycle', async () => {
  const fixture = await setup();
  const result = await collect(fixture.make());
  expect(result).toContainEqual({ type: 'delta', content: 'Fixture response' });
  expect(result.at(-1)).toEqual({ type: 'completed' });
  expect(
    fixture.transports[0].calls.filter((call) => call.method === 'session/prompt'),
  ).toHaveLength(1);
  expect(
    fixture.transports[0].calls.find((call) => call.method === 'session/set_config_option')?.params,
  ).toMatchObject({ value: 'flash-low', configId: 'model' });
});

it('uses the standard models capability when configOptions is absent', async () => {
  const fixture = await setup((transport) => {
    transport.legacyModels = true;
  });
  await collect(fixture.make());
  expect(
    fixture.transports[0].calls.find((call) => call.method === 'session/set_model')?.params,
  ).toMatchObject({ modelId: 'flash-low' });
});

it.each(['unknown-model', 'ignored-selection'] as const)(
  'never prompts with an unintended route: %s',
  async (scenario) => {
    const fixture = await setup((transport) => {
      transport.rejectsSelection = true;
    });
    await expect(
      collect(fixture.make(), scenario === 'unknown-model' ? 'foreign-model' : 'flash-low'),
    ).rejects.toMatchObject({ code: 'LOCAL_AGENT_MODEL_UNSUPPORTED' });
    expect(fixture.transports[0].calls.some((call) => call.method === 'session/prompt')).toBe(
      false,
    );
  },
);

it.each([
  'LOCAL_AGENT_RATE_LIMITED',
  'LOCAL_AGENT_QUOTA_EXHAUSTED',
  'LOCAL_AGENT_LOGIN_REQUIRED',
] as const)('preserves safe %s without automatic retries', async (code) => {
  const fixture = await setup((transport) => {
    transport.failure = code;
  });
  await expect(collect(fixture.make())).rejects.toMatchObject({ code });
  expect(
    fixture.transports[0].calls.filter((call) => call.method === 'session/prompt'),
  ).toHaveLength(1);
  expect(fixture.transports[0].closed).toBe(true);
});

it('resumes the same native identity while restoring per-action approval mode before prompting', async () => {
  const fixture = await setup((transport) => {
    transport.mode = 'yolo';
  });
  const events = await collect(fixture.make());
  const session = events.find((event) => event.type === 'session')!;
  if (session.type !== 'session') throw new Error('Missing native session');
  await collect(fixture.make(), 'flash-low', {
    nativeSessionId: session.nativeSessionId,
    accountFingerprint: session.accountFingerprint,
  });
  const transport = fixture.transports[1];
  expect(transport.calls.find((call) => call.method === 'session/resume')?.params).toMatchObject({
    sessionId: 'agy-session',
  });
  expect(transport.calls.find((call) => call.method === 'session/set_mode')?.params).toMatchObject({
    modeId: 'default',
  });
  expect(transport.calls.findIndex((call) => call.method === 'session/set_mode')).toBeLessThan(
    transport.calls.findIndex((call) => call.method === 'session/prompt'),
  );
});

it('fences changed native auth metadata before passing an old session identifier to the Agent', async () => {
  const fixture = await setup();
  const fingerprint = await nativeIdentity('antigravity', fixture.home);
  await writeFile(
    join(fixture.home, 'antigravity-acp', 'acp_token.json'),
    JSON.stringify({ client_id: 'fixture-client', refresh_token: 'replaced-native-account-file' }),
  );
  await expect(
    collect(fixture.make(), 'flash-low', {
      nativeSessionId: 'old-account-session',
      accountFingerprint: fingerprint,
    }),
  ).rejects.toMatchObject({ code: 'LOCAL_AGENT_SESSION_UNAVAILABLE' });
  expect(fixture.transports[0].calls.some((call) => call.method.startsWith('session/'))).toBe(
    false,
  );
});

it('keeps interaction questions distinct from tool approvals and rejects invalid or duplicate answers', async () => {
  const fixture = await setup((transport) => {
    transport.ask = 'question';
  });
  const driver = fixture.make();
  const stream = driver.run({ content: 'Offline question', modelId: 'flash-low' });
  await stream.next();
  const requested = (await stream.next()).value;
  expect(requested).toMatchObject({ type: 'request', request: { type: 'user_input' } });
  if (!requested || requested.type !== 'request' || requested.request.type !== 'user_input')
    throw new Error('Missing question');
  const id = requested.request.requestId;
  expect(driver.respond(id, { type: 'permission', decision: 'approve_once' })).toBe(false);
  expect(
    driver.respond(id, { type: 'user_input', answers: [{ questionId: 'wrong', values: ['Yes'] }] }),
  ).toBe(false);
  expect(
    driver.respond(id, {
      type: 'user_input',
      answers: [{ questionId: 'interaction_destination', values: ['Yes'] }],
    }),
  ).toBe(true);
  expect(
    driver.respond(id, {
      type: 'user_input',
      answers: [{ questionId: 'interaction_destination', values: ['Yes'] }],
    }),
  ).toBe(false);
  for await (const _event of stream) {
    /* settle */
  }
  expect(fixture.transports[0].responses).toContainEqual({
    id: 42,
    result: { outcome: { outcome: 'selected', optionId: 'yes' } },
  });
});

it('cancels pending native permission without accepting a stale response or granting a tool', async () => {
  const fixture = await setup((transport) => {
    transport.ask = 'permission';
  });
  const driver = fixture.make();
  const stream = driver.run({ content: 'Offline cancel', modelId: 'flash-high' });
  await stream.next();
  const event = (await stream.next()).value;
  if (!event || event.type !== 'request') throw new Error('Missing request');
  driver.cancel();
  expect(
    driver.respond(event.request.requestId, { type: 'permission', decision: 'approve_once' }),
  ).toBe(false);
  for await (const _event of stream) {
    /* settle */
  }
  expect(fixture.transports[0].responses).toContainEqual({
    id: 42,
    result: { outcome: { outcome: 'cancelled' } },
  });
  expect(fixture.transports[0].notifications).toContainEqual({
    method: 'session/cancel',
    params: { sessionId: 'agy-session' },
  });
});

it('stops during asynchronous native preflight without spawning an Agent or leaking its temporary directory', async () => {
  const fixture = await setup();
  const driver = fixture.make();
  let directory = '';
  temporaryPreflight.onCreated = (created) => {
    directory = created;
    driver.cancel();
  };
  const events = await collect(driver);
  expect(events).toEqual([{ type: 'cancelled' }]);
  expect(fixture.transports).toHaveLength(0);
  expect(directory).not.toBe('');
  expect(existsSync(directory)).toBe(false);
});

it('treats close during asynchronous native preflight as a stop without spawning an Agent', async () => {
  const fixture = await setup();
  const driver = fixture.make();
  let directory = '';
  temporaryPreflight.onCreated = (created) => {
    directory = created;
    void driver.close();
  };
  const events = await collect(driver);
  expect(events).toEqual([{ type: 'cancelled' }]);
  expect(fixture.transports).toHaveLength(0);
  expect(directory).not.toBe('');
  expect(existsSync(directory)).toBe(false);
});

it('closes a transport that was constructed after cancellation instead of starting a turn', async () => {
  const fixture = await setup();
  const holder: { driver?: AcpDriver } = {};
  const driver = new AcpDriver(fixture.connection, fixture.home, (options) => {
    const transport = new FakeAntigravity(options);
    // Cancellation can land between the preflight fence and assignment of the
    // freshly spawned transport. It must still be closed, not leaked.
    holder.driver?.cancel();
    fixture.transports.push(transport);
    return transport as unknown as NativeRpcTransport;
  });
  holder.driver = driver;
  const events = await collect(driver);
  expect(events).toEqual([{ type: 'cancelled' }]);
  expect(fixture.transports).toHaveLength(1);
  expect(fixture.transports[0].closed).toBe(true);
  expect(fixture.transports[0].calls).toEqual([]);
});

it('directs missing Google credentials to the explicit Settings sign-in action for probes and turns', async () => {
  const fixture = await setup();
  await rm(join(fixture.home, 'antigravity-acp', 'acp_token.json'));
  const message =
    'Google sign-in is required. Open Settings → AI → Providers → Antigravity and select “Sign in with Google”.';
  expect(await fixture.make().probe()).toMatchObject({ status: 'login_required', message });
  await expect(collect(fixture.make())).rejects.toMatchObject({
    code: 'LOCAL_AGENT_LOGIN_REQUIRED',
    message,
  });
});

it('directs expired Google credentials during a turn to the explicit sign-in action', async () => {
  const fixture = await setup((transport) => {
    transport.failure = 'LOCAL_AGENT_LOGIN_REQUIRED';
  });
  await expect(collect(fixture.make())).rejects.toMatchObject({
    code: 'LOCAL_AGENT_LOGIN_REQUIRED',
    message:
      'Google sign-in is required. Open Settings → AI → Providers → Antigravity and select “Sign in with Google”.',
  });
});
