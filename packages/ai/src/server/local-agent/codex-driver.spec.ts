import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalAgentStatusSchema } from '@memoflow/contracts/ai';
import {
  createNativeAgentFlowFixture,
  type NativeProbeFailure,
} from '../../testing/native-agent-flow';
import type { LocalAgentConnection } from '@memoflow/contracts/ai';
import { NativeRpcTransport } from './native-rpc-transport';
import { CodexDriver } from './codex-driver';

const connection: LocalAgentConnection = {
  id: 'connection',
  driver: 'codex',
  name: 'Codex',
  executablePath: '/fake/codex',
  enabled: true,
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
  writeScopes: [],
};
function driver(extra = '', config: LocalAgentConnection = connection) {
  const script = `
    const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
    let initialized = false;
    require('readline').createInterface({input: process.stdin}).on('line', line => {
      const frame = JSON.parse(line);
      const reply = result => send({id: frame.id, result});
      ${extra}
      if (frame.method === 'initialize') { initialized = true; reply({userAgent:'test'}); }
      else if (frame.method === 'initialized') {}
      else if (!initialized) process.exit(9);
      else if (frame.method === 'account/read') reply({account:{type:'chatgpt',email:'fixture@example.test',planType:'team'},requiresOpenaiAuth:true});
      else if (frame.method === 'model/list') reply({data:[{id:'model',model:'model',displayName:'Fixture'}],nextCursor:null});
      else if (frame.method === 'thread/start' || frame.method === 'thread/resume') {
        if (frame.params.config.mcp_servers.memoflow.http_headers.Authorization !== 'Bearer fixture') process.exit(8);
        reply({thread:{id:frame.params.threadId || 'native-1'}});
      }
      else if (frame.method === 'turn/start') {
        reply({turn:{id:'turn-1'}});
        send({method:'turn/started',params:{threadId:'native-1',turn:{id:'turn-1'}}});
        send({method:'item/agentMessage/delta',params:{threadId:'native-1',turnId:'turn-1',itemId:'msg',delta:'Hello'}});
        send({id:900,method:'item/commandExecution/requestApproval',params:{threadId:'native-1',turnId:'turn-1',itemId:'cmd',command:'pwd'}});
      }
      else if (frame.id === 900 && frame.result) {
        send({method:'serverRequest/resolved',params:{threadId:'native-1',requestId:900}});
        send({method:'turn/completed',params:{threadId:'native-1',turn:{id:'turn-1',status:frame.result.decision === 'accept' ? 'completed' : 'interrupted'}}});
      }
    });
  `;
  return new CodexDriver(
    config,
    process.cwd(),
    (options) =>
      new NativeRpcTransport({
        ...options,
        executable: process.execPath,
        args: ['-e', script],
        requestTimeoutMs: 1000,
      }),
  );
}

describe('Codex native driver', () => {
  it.each([
    ['spawn', 'not_installed', 'The configured Agent executable could not be started.', undefined],
    [
      'stderr',
      'unavailable',
      'The local Agent is unavailable. Check its native configuration.',
      undefined,
    ],
    ['rpc', 'unavailable', 'The local Agent is unavailable. Check its native configuration.', 503],
    [
      'rpc',
      'unavailable',
      'The local Agent returned an unsupported or invalid protocol message.',
      -32603,
    ],
  ] as const)(
    'publishes only sanitized %s/%s probe diagnostics',
    async (kind, status, message, code) => {
      const directory = await mkdtemp(join(tmpdir(), 'memoflow-probe-privacy-'));
      vi.stubEnv('CODEX_HOME', directory);
      const flow = createNativeAgentFlowFixture(directory);
      const logs = (['debug', 'info', 'log', 'warn', 'error'] as const).map((method) =>
        vi.spyOn(console, method).mockImplementation(() => {}),
      );
      try {
        flow.setProbeFailure({
          kind,
          ...(code === undefined ? {} : { code }),
          message:
            'Native startup or RPC failed PRIVATE_STDERR_FIXTURE C:\\\\Users\\\\PRIVATE_HOME_FIXTURE user@PRIVATE_ACCOUNT_FIXTURE.test api_key=PRIVATE_KEY_FIXTURE',
        } as NativeProbeFailure);
        const result = await flow.local.probeDefaultDriver('codex');
        expect(LocalAgentStatusSchema.parse(result)).toEqual({ status, message });
        expect(JSON.stringify(result)).not.toContain('PRIVATE_');
        expect(JSON.stringify(logs.flatMap((log) => log.mock.calls))).not.toContain('PRIVATE_');
        expect(flow.requests.some(([method]) => method === 'turn/start')).toBe(false);
      } finally {
        await flow.close();
        logs.forEach((log) => log.mockRestore());
        vi.unstubAllEnvs();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it('reports a valid failed turn as unavailable instead of protocol corruption', async () => {
    const native = driver(`if (frame.method === 'turn/start') {
      reply({turn:{id:'turn-1'}});
      setTimeout(() => send({method:'turn/completed',params:{threadId:'native-1',turn:{id:'turn-1',status:'failed'}}}),10);
      return;
    }`);
    const run = native.run({
      modelId: 'model',
      content: 'Hi',
      mcp: { url: 'http://127.0.0.1/mcp', token: 'fixture' },
    });
    await run.next();
    await expect(run.next()).rejects.toMatchObject({ code: 'LOCAL_AGENT_UNAVAILABLE' });
  });
  it('classifies a native turn/start JSON-RPC 429 without exposing raw diagnostics', async () => {
    const native = driver(`if(frame.method === 'turn/start') {
      send({id:frame.id,error:{code:429,message:'Upstream rate limit with internal account details'}});
      return;
    }`);
    const run = native.run({
      modelId: 'model',
      content: 'Hi',
      mcp: { url: 'http://127.0.0.1/mcp', token: 'fixture' },
    });
    await expect(run.next()).resolves.toMatchObject({ value: { type: 'session' } });
    await expect(run.next()).rejects.toMatchObject({ code: 'LOCAL_AGENT_RATE_LIMITED' });
  });

  it('classifies a failed native turn quota exhaustion with a sanitized public error', async () => {
    const native = driver(`if(frame.method === 'turn/start') {
      reply({turn:{id:'turn-1'}});
      setTimeout(() => send({method:'turn/completed',params:{
        threadId:'native-1',turn:{id:'turn-1',status:'failed',
          error:{message:'insufficient_quota: internal diagnostic details'}}}}),10);
      return;
    }`);
    const run = native.run({
      modelId: 'model',
      content: 'Hi',
      mcp: { url: 'http://127.0.0.1/mcp', token: 'fixture' },
    });
    await expect(run.next()).resolves.toMatchObject({ value: { type: 'session' } });
    await expect(run.next()).rejects.toMatchObject({ code: 'LOCAL_AGENT_QUOTA_EXHAUSTED' });
  });

  it('queries native account and catalog without starting inference', async () => {
    expect(await driver().probe()).toMatchObject({
      status: 'ready',
      models: [{ id: 'model', name: 'Fixture' }],
    });
    expect(
      await driver(
        `if(frame.method === 'account/read'){reply({account:null,requiresOpenaiAuth:true});return;}`,
      ).probe(),
    ).toMatchObject({ status: 'login_required' });
  });

  it('reports only the actual Codex CLI version from initialize.userAgent', async () => {
    const native = driver(`if(frame.method === 'initialize') {
      initialized = true;
      reply({userAgent:'codex/0.154.0 (Windows; x86_64)'});
      return;
    }`);
    expect(await native.probe()).toMatchObject({
      status: 'ready',
      version: '0.154.0',
      models: [{ id: 'model', name: 'Fixture' }],
    });
    // Unknown or untrusted handshake text is not a CLI version.
    expect(await driver().probe()).not.toHaveProperty('version');
  });

  it('projects the live catalog effort and service-tier metadata without guessing options', async () => {
    const native = driver(`if(frame.method === 'model/list') {
      reply({data:[{id:'model',model:'model',displayName:'Fixture',
        supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'super-high'}],
        defaultReasoningEffort:'low',
        serviceTiers:[{id:'priority',name:'Fast'}],defaultServiceTier:'priority'}],nextCursor:null});return;
    }`);
    expect(await native.probe()).toMatchObject({
      status: 'ready',
      models: [
        {
          id: 'model',
          reasoningEfforts: ['low', 'super-high'],
          defaultReasoningEffort: 'low',
          serviceTiers: [{ id: 'priority', name: 'Fast' }],
          defaultServiceTier: 'priority',
        },
      ],
    });
  });

  it('forwards only explicitly selected native traits to Codex turn/start', async () => {
    const native = driver(`if(frame.method === 'turn/start') {
      if(frame.params.effort !== 'super-high' || frame.params.serviceTierForTurn !== 'priority') process.exit(8);
      reply({turn:{id:'turn-1'}});
      send({method:'turn/completed',params:{threadId:'native-1',turn:{id:'turn-1',status:'completed'}}});
      return;
    }`);
    const results = [];
    for await (const result of native.run({
      modelId: 'model',
      modelOptions: { reasoningEffort: 'super-high', serviceTier: 'priority' },
      content: 'Hi',
      mcp: { url: 'http://127.0.0.1/mcp', token: 'fixture' },
    }))
      results.push(result);
    expect(results.at(-1)).toEqual({ type: 'completed' });
  });

  it('resumes the same native thread, injects session MCP, streams and answers a scoped permission request', async () => {
    const native = driver();
    const events = [];
    for await (const event of native.run({
      nativeSessionId: 'native-1',
      modelId: 'model',
      content: 'Hi',
      mcp: { url: 'http://127.0.0.1:12345/mcp', token: 'fixture' },
    })) {
      events.push(event);
      if (event.type === 'request')
        expect(
          native.respond(event.request.requestId, { type: 'permission', decision: 'approve_once' }),
        ).toBe(true);
    }
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'session', nativeSessionId: 'native-1' }),
    );
    expect(events).toContainEqual({ type: 'delta', content: 'Hello' });
    expect(events).toContainEqual(expect.objectContaining({ type: 'request_resolved' }));
    expect(events.at(-1)).toEqual({ type: 'completed' });
    expect(native.respond('900', { type: 'permission', decision: 'approve_once' })).toBe(false);
  });

  it('rejects a resumed thread identity mismatch instead of starting another thread', async () => {
    const native = driver(
      `if(frame.method === 'thread/resume'){reply({thread:{id:'other-thread'}});return;}`,
    );
    const run = native.run({
      nativeSessionId: 'native-1',
      modelId: 'model',
      content: 'Hi',
      mcp: { url: 'http://127.0.0.1:1/mcp', token: 'fixture' },
    });
    await expect(run.next()).rejects.toMatchObject({ code: 'LOCAL_AGENT_SESSION_UNAVAILABLE' });
  });
});

it('partitions visibility by native executable, home and verified account without exposing their values', async () => {
  const first = await driver().probe();
  expect(first.status).toBe('ready');
  if (first.status !== 'ready') throw new Error('Expected catalog');
  expect(first.modelVisibilityContext).toMatch(/^mvc1:[0-9a-f]{64}$/);
  const repeat = await driver().probe();
  expect(repeat).toHaveProperty('modelVisibilityContext', first.modelVisibilityContext);
  for (const changed of [
    await driver('', { ...connection, executablePath: '/private/other/codex' }).probe(),
    await driver('', { ...connection, homePath: '/nonexistent/memoflow-fixture-home' }).probe(),
    await driver(`if(frame.method==='account/read') {
      reply({account:{type:'chatgpt',email:'other@example.test'},requiresOpenaiAuth:true});return;
    }`).probe(),
  ]) {
    expect(changed.status).toBe('ready');
    if (changed.status !== 'ready') throw new Error('Expected catalog');
    expect(changed.modelVisibilityContext).toMatch(/^mvc1:[0-9a-f]{64}$/);
    expect(changed.modelVisibilityContext).not.toBe(first.modelVisibilityContext);
    expect(changed.modelVisibilityContext).not.toContain('private');
    expect(changed.modelVisibilityContext).not.toContain('example.test');
  }
});
it('does not invent a stable visibility account for an API-key-only or absent account', async () => {
  for (const account of [{ type: 'apiKey' }, null]) {
    const status = await driver(`if(frame.method==='account/read') {
      reply({account:${JSON.stringify(account)},requiresOpenaiAuth:false});return;
    }`).probe();
    expect(status.status).toBe('ready');
    expect(status).not.toHaveProperty('modelVisibilityContext');
  }
});
