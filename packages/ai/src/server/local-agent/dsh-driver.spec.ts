import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalAgentStatusSchema } from '@memoflow/ai-contracts';
import { expect, it } from 'vitest';
import type { LocalAgentConnection } from '@memoflow/ai-contracts';
import { AcpDriver } from './acp-driver';
import {
  LocalAgentError,
  LOCAL_AGENT_FAILURES,
  type LocalAgentFailureCode,
} from '../../shared/local-agent-error';
import { type NativeProcessOptions, NativeRpcTransport } from './native-rpc-transport';

const route = JSON.stringify(['ollama', 'gpt-oss:20b']);
const models = [
  {
    id: 'model',
    name: 'Model',
    type: 'select',
    currentValue: route,
    options: [
      { group: 'ollama', name: 'Ollama', options: [{ value: route, name: 'gpt-oss 20B' }] },
    ],
  },
];
const connection: LocalAgentConnection = {
  id: 'dsh',
  driver: 'dsh',
  name: 'DSH',
  executablePath: 'dsh',
  enabled: true,
  writeScopes: [],
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
};

class FakeAcp {
  readonly calls: Array<{ method: string; params: unknown }> = [];
  readonly sent: Array<{ id: number; result: unknown }> = [];
  readonly notifications: Array<{ method: string; params: unknown }> = [];
  closed = false;
  onNotification?: (method: string, params: unknown) => void;
  onRequest?: (request: { id: number; method: string; params?: unknown }) => void;
  onFailure?: (error: never) => void;
  private finishPermission?: () => void;
  agentInfo: { name: string; version: string } | undefined = {
    name: 'DeepSeek Harness',
    version: '2.4.1',
  };

  constructor(readonly options: NativeProcessOptions) {}

  async request(method: string, params: unknown): Promise<unknown> {
    this.calls.push({ method, params });
    if (method === 'initialize')
      return {
        protocolVersion: 1,
        ...(this.agentInfo ? { agentInfo: this.agentInfo } : {}),
        agentCapabilities: {
          mcpCapabilities: { http: true },
          sessionCapabilities: { list: {}, close: {}, resume: {} },
        },
      };
    if (method === 'session/new') return { sessionId: 'dsh-native-1', configOptions: models };
    if (method === 'session/resume') return { configOptions: models };
    if (method === 'session/set_config_option') return { configOptions: models };
    if (method === 'session/close') return {};
    if (method === 'session/prompt') {
      this.onNotification?.('session/update', {
        sessionId: 'dsh-native-1',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'call-1',
          title: 'goal_search',
          status: 'in_progress',
        },
      });
      this.onRequest?.({
        id: 71,
        method: 'session/request_permission',
        params: {
          sessionId: 'dsh-native-1',
          toolCall: { toolCallId: 'call-1', title: 'goal_search' },
          options: [
            { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
            { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
          ],
        },
      });
      await new Promise<void>((resolve) => {
        this.finishPermission = resolve;
      });
      this.onNotification?.('session/update', {
        sessionId: 'dsh-native-1',
        update: { sessionUpdate: 'tool_call_update', toolCallId: 'call-1', status: 'completed' },
      });
      this.onNotification?.('session/update', {
        sessionId: 'dsh-native-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'BYOA acceptance orchard-7341' },
        },
      });
      return { stopReason: 'end_turn' };
    }
    throw new Error(`Unexpected ACP method: ${method}`);
  }
  respond(id: number, result: unknown) {
    this.sent.push({ id, result });
    this.finishPermission?.();
  }
  notify(method: string, params: unknown) {
    this.notifications.push({ method, params });
  }
  rejectRequest() {
    throw new Error('Unexpected rejected ACP request');
  }
  async close() {
    this.closed = true;
  }
}
function factory(instances: FakeAcp[]) {
  return (options: NativeProcessOptions): NativeRpcTransport => {
    const fake = new FakeAcp(options);
    instances.push(fake);
    return fake as unknown as NativeRpcTransport;
  };
}

it('discovers DSH models through ACP without invoking inference', async () => {
  const instances: FakeAcp[] = [];
  const driver = new AcpDriver(connection, '/tmp', factory(instances));
  expect(await driver.probe()).toMatchObject({
    status: 'ready',
    models: [{ id: route, name: 'gpt-oss 20B', provider: 'Ollama' }],
    version: '2.4.1',
    modelVisibilityContext: expect.stringMatching(/^mvc1:[0-9a-f]{64}$/),
  });
  expect(instances).toHaveLength(1);
  expect(instances[0].options).toMatchObject({ protocol: 'acp', args: ['--profile', 'acp'] });
  expect(instances[0].calls.map((call) => call.method)).toEqual([
    'initialize',
    'session/new',
    'session/close',
  ]);
  expect(instances[0].closed).toBe(true);
});

it('does not present an ACP protocol version as the DSH executable version', async () => {
  const instances: FakeAcp[] = [];
  const driver = new AcpDriver(connection, '/tmp', (options) => {
    const fake = new FakeAcp(options);
    fake.agentInfo = undefined;
    instances.push(fake);
    return fake as unknown as NativeRpcTransport;
  });
  const status = await driver.probe();
  expect(status.status).toBe('ready');
  expect(status).not.toHaveProperty('version');
  expect(instances[0].closed).toBe(true);
});

it('sends a per-run MCP grant and can resume the same native DSH session', async () => {
  const instances: FakeAcp[] = [];
  const createDriver = () => new AcpDriver(connection, '/tmp', factory(instances));
  let nativeSessionId: string | undefined;
  let accountFingerprint: string | undefined;
  for (const token of ['first-token', 'rotated-token']) {
    const driver = createDriver();
    const result = [];
    for await (const event of driver.run({
      nativeSessionId,
      accountFingerprint,
      modelId: route,
      content: 'Search Goal orchard.',
      mcp: { url: 'http://127.0.0.1:19200/mcp', token },
    })) {
      result.push(event);
      if (event.type === 'session') {
        nativeSessionId = event.nativeSessionId;
        accountFingerprint = event.accountFingerprint;
      }
      if (event.type === 'request') {
        expect(event.request.title).toBe('goal_search');
        expect(
          driver.respond(event.request.requestId, { type: 'permission', decision: 'approve_once' }),
        ).toBe(true);
      }
    }
    expect(result).toContainEqual({ type: 'delta', content: 'BYOA acceptance orchard-7341' });
    expect(result.at(-1)).toEqual({ type: 'completed' });
    expect(result).toContainEqual({
      type: 'activity',
      toolCallId: 'call-1',
      label: 'goal_search',
      state: 'completed',
    });
  }
  expect(nativeSessionId).toBe('dsh-native-1');
  expect(instances[0].calls.some((call) => call.method === 'session/new')).toBe(true);
  expect(instances[1].calls.some((call) => call.method === 'session/resume')).toBe(true);
  for (const [index, token] of ['first-token', 'rotated-token'].entries()) {
    const call = instances[index].calls.find((entry) =>
      ['session/new', 'session/resume'].includes(entry.method),
    );
    expect(call?.params).toMatchObject({
      mcpServers: [
        {
          name: 'memoflow',
          type: 'http',
          headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
        },
      ],
    });
    expect(instances[index].sent).toEqual([
      { id: 71, result: { outcome: { outcome: 'selected', optionId: 'allow-once' } } },
    ]);
    expect(instances[index].closed).toBe(true);
  }
});

it.each([
  'LOCAL_AGENT_RATE_LIMITED',
  'LOCAL_AGENT_QUOTA_EXHAUSTED',
  'LOCAL_AGENT_LOGIN_REQUIRED',
  'LOCAL_AGENT_MODEL_UNSUPPORTED',
] as const)(
  'preserves a classified ACP prompt failure %s without exposing private diagnostics',
  async (code) => {
    const instances: FakeAcp[] = [];
    const driver = new AcpDriver(connection, '/tmp', (options) => {
      const fake = new FakeAcp(options);
      const original = fake.request.bind(fake);
      fake.request = async (method, params) => {
        if (method === 'session/prompt') {
          fake.calls.push({ method, params });
          // The actual JSON-RPC transport performs the sensitive native error
          // classification; Driver must preserve this sanitized public code.
          throw new LocalAgentError(code);
        }
        return original(method, params);
      };
      instances.push(fake);
      return fake as unknown as NativeRpcTransport;
    });

    const observed: string[] = [];
    await expect(
      (async () => {
        for await (const event of driver.run({ content: 'A short turn', modelId: route })) {
          observed.push(event.type);
        }
      })(),
    ).rejects.toMatchObject({ code, message: LOCAL_AGENT_FAILURES[code] });

    expect(observed).toEqual(['session']);
    expect(instances).toHaveLength(1);
    expect(instances[0].calls.filter((call) => call.method === 'session/prompt')).toHaveLength(1);
    expect(instances[0].closed).toBe(true);
  },
);

it('sanitizes an unclassified ACP prompt exception without leaking upstream text', async () => {
  const privateDiagnostic = 'PRIVATE_TOKEN_DO_NOT_EXPOSE account@example.test';
  const driver = new AcpDriver(connection, '/tmp', (options) => {
    const fake = new FakeAcp(options);
    const original = fake.request.bind(fake);
    fake.request = async (method, params) => {
      if (method === 'session/prompt') throw new Error(privateDiagnostic);
      return original(method, params);
    };
    return fake as unknown as NativeRpcTransport;
  });
  await expect(
    (async () => {
      for await (const _event of driver.run({ content: 'A short turn', modelId: route })) {
        // No private errors are emitted as runtime events.
      }
    })(),
  ).rejects.toMatchObject({
    code: 'LOCAL_AGENT_UNAVAILABLE' satisfies LocalAgentFailureCode,
    message: LOCAL_AGENT_FAILURES.LOCAL_AGENT_UNAVAILABLE,
  });
});

it('refuses a model not present in DSH ACP catalog without submitting a prompt', async () => {
  const instances: FakeAcp[] = [];
  const driver = new AcpDriver(connection, '/tmp', factory(instances));
  await expect(
    (async () => {
      for await (const _event of driver.run({ content: 'Hello', modelId: 'anyrouter/unrelated' })) {
        // No prompt output should be produced.
      }
    })(),
  ).rejects.toMatchObject({ code: 'LOCAL_AGENT_MODEL_UNSUPPORTED' });
  expect(instances[0].calls.some((call) => call.method === 'session/prompt')).toBe(false);
});

it('refuses to resume DSH with a mismatched Profile identity', async () => {
  const instances: FakeAcp[] = [];
  const driver = new AcpDriver(connection, '/tmp', factory(instances));
  await expect(
    (async () => {
      for await (const _event of driver.run({
        content: 'Hello',
        modelId: route,
        nativeSessionId: 'dsh-native-1',
        accountFingerprint: 'old-profile-fingerprint',
      })) {
        // The old session ID must not be given to an Agent with a different identity.
      }
    })(),
  ).rejects.toMatchObject({ code: 'LOCAL_AGENT_SESSION_UNAVAILABLE' });
  expect(instances).toHaveLength(0);
});

it('refuses a model route that ACP did not actually select', async () => {
  const instances: FakeAcp[] = [];
  const desired = JSON.stringify(['ollama', 'gpt-oss:120b']);
  const driver = new AcpDriver(connection, '/tmp', (options) => {
    const fake = new FakeAcp(options);
    fake.request = async (method, params) => {
      fake.calls.push({ method, params });
      if (method === 'initialize')
        return {
          protocolVersion: 1,
          agentCapabilities: {
            mcpCapabilities: { http: true },
            sessionCapabilities: { resume: {} },
          },
        };
      if (method === 'session/new' || method === 'session/set_config_option')
        return {
          ...(method === 'session/new' ? { sessionId: 'dsh-native-1' } : {}),
          configOptions: [
            {
              ...models[0],
              options: [
                {
                  group: 'ollama',
                  name: 'Ollama',
                  options: [
                    { value: route, name: 'gpt-oss 20B' },
                    { value: desired, name: 'gpt-oss 120B' },
                  ],
                },
              ],
            },
          ],
        };
      return {};
    };
    instances.push(fake);
    return fake as unknown as NativeRpcTransport;
  });
  await expect(
    (async () => {
      for await (const _event of driver.run({ content: 'Hello', modelId: desired })) {
        // Incorrect model selection must fail before inference.
      }
    })(),
  ).rejects.toMatchObject({ code: 'LOCAL_AGENT_MODEL_UNSUPPORTED' });
  expect(instances[0].calls.some((call) => call.method === 'session/set_config_option')).toBe(true);
  expect(instances[0].calls.some((call) => call.method === 'session/prompt')).toBe(false);
});

it('never turns a rejected ACP permission into a write grant', async () => {
  const instances: FakeAcp[] = [];
  const driver = new AcpDriver(connection, '/tmp', factory(instances));
  let permissionRequestId = '';
  for await (const event of driver.run({
    modelId: route,
    content: 'Only read the Goal',
    mcp: { url: 'http://127.0.0.1/mcp', token: 'ephemeral' },
  })) {
    if (event.type === 'request') {
      permissionRequestId = event.request.requestId;
      expect(driver.respond(permissionRequestId, { type: 'permission', decision: 'decline' })).toBe(
        true,
      );
    }
  }
  expect(instances[0].sent).toEqual([
    { id: 71, result: { outcome: { outcome: 'selected', optionId: 'reject-once' } } },
  ]);
  expect(
    driver.respond(permissionRequestId, { type: 'permission', decision: 'approve_once' }),
  ).toBe(false);
});

it.each([
  '',
  'ACP v1',
  '2.4.1\nprivate diagnostic',
  '2.4.1\u2028private diagnostic',
  'x'.repeat(500),
])('omits untrusted DSH version metadata %j without losing its catalog', async (version) => {
  const driver = new AcpDriver(connection, '/tmp', (options) => {
    const fake = new FakeAcp(options);
    fake.agentInfo = { name: 'DeepSeek Harness', version };
    return fake as unknown as NativeRpcTransport;
  });
  const result = await driver.probe();
  expect(result).toMatchObject({ status: 'ready', models: [{ id: route }] });
  expect(result).not.toHaveProperty('version');
});

it.each([
  [
    '401 Unauthorized',
    'login_required',
    'Sign in using the Agent’s native login command, then refresh.',
  ],
  [
    'Native connection failed',
    'unavailable',
    'The local Agent is unavailable. Check its native configuration.',
  ],
])(
  'sanitizes dsh native RPC %s before publishing the status DTO',
  async (prefix, status, message) => {
    const cwd = await mkdtemp(join(tmpdir(), 'memoflow-dsh-privacy-'));
    const diagnostic = `${prefix} C:\\Users\\PRIVATE_HOME_FIXTURE PRIVATE_ACCOUNT_FIXTURE@example.test api_key=PRIVATE_KEY_FIXTURE`;
    const script = `
    const diagnostic = ${JSON.stringify(diagnostic)};
    require('readline').createInterface({input:process.stdin}).on('line', line => {
      const frame = JSON.parse(line);
      process.stderr.write(diagnostic);
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:frame.id,error:{code:401,message:diagnostic}}) + '\\n');
    });
  `;
    const driver = new AcpDriver(
      { ...connection, homePath: cwd },
      cwd,
      (options) =>
        new NativeRpcTransport({
          ...options,
          executable: process.execPath,
          args: ['-e', script],
          requestTimeoutMs: 1000,
        }),
    );
    try {
      const result = await driver.probe();
      expect(LocalAgentStatusSchema.parse(result)).toEqual({ status, message });
      expect(JSON.stringify(result)).not.toContain('PRIVATE_');
    } finally {
      await driver.close();
      await rm(cwd, { recursive: true, force: true });
    }
  },
);
