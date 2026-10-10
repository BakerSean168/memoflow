import { describe, expect, it } from 'vitest';
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
function driver(extra = '') {
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
      else if (frame.method === 'account/read') reply({account:{type:'chatgpt',email:'fixture@example.test'},requiresOpenaiAuth:true});
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
    connection,
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
