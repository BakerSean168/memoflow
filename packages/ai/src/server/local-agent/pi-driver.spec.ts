import { expect, it } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LocalAgentConnection } from '@memoflow/contracts/ai';
import { PiDriver } from './pi-driver';
import { NativeRpcTransport } from './native-rpc-transport';
import { LocalAgentError } from '../../shared/local-agent-error';
const connection: LocalAgentConnection = {
  id: 'pi',
  driver: 'pi',
  name: 'Pi',
  executablePath: 'pi',
  enabled: true,
  writeScopes: [],
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
};
it('reads native models, resumes a session and handles extension UI with scoped cleanup', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'memoflow-pi-test-'));
  const script = `
    const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
    require('readline').createInterface({input:process.stdin}).on('line', line => {
      const frame = JSON.parse(line);
      const reply = data => send({type:'response',id:frame.id,command:frame.type,success:true,data});
      if(frame.type==='get_state') reply({sessionId:'native',sessionFile:'/native/history.jsonl'});
      else if(frame.type==='get_available_models') reply({models:[{id:'model',provider:'provider',name:'Model'}]});
      else if(frame.type==='set_model') {if(frame.provider!=='provider'||frame.modelId!=='model') process.exit(7);reply({});}
      else if(frame.type==='prompt') {reply({disposition:'started'});send({type:'extension_ui_request',id:'question',method:'input',title:'Which label?'});}
      else if(frame.type==='extension_ui_response') {if(frame.value!=='answer') process.exit(8);send({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'Done'}});send({type:'message_end',message:{role:'assistant',stopReason:'stop'}});send({type:'agent_end'});send({type:'agent_settled'});}
    });`;
  const create = () =>
    new PiDriver(
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
    expect(await create().probe()).toMatchObject({
      status: 'ready',
      models: [{ id: 'provider/model', name: 'Model', provider: 'provider' }],
    });
    const driver = create();
    const events = [];
    for await (const event of driver.run({
      nativeSessionId: 'native',
      content: 'Hello',
      modelId: 'provider/model',
      mcp: { url: 'http://127.0.0.1/mcp', token: 'test' },
    })) {
      events.push(event);
      if (event.type === 'request')
        expect(
          driver.respond(event.request.requestId, {
            type: 'user_input',
            answers: [{ questionId: 'value', values: ['answer'] }],
          }),
        ).toBe(true);
    }
    expect(events).toContainEqual({ type: 'delta', content: 'Done' });
    expect(events.at(-1)).toEqual({ type: 'completed' });
    expect(
      (await readdir(cwd)).filter((name) => name.startsWith('memoflow-pi-extension-')),
    ).toEqual([]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
it('explains a missing executable without replacing it with a generic configuration error', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'memoflow-pi-missing-'));
  try {
    const driver = new PiDriver(
      { ...connection, homePath: cwd, executablePath: join(cwd, 'missing pi') },
      cwd,
    );
    expect(await driver.probe()).toEqual({
      status: 'not_installed',
      message: new LocalAgentError('LOCAL_AGENT_NOT_INSTALLED').message,
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
it('reports a nonzero native exit instead of a successful empty turn', async () => {
  const driver = new PiDriver(
    connection,
    '/tmp',
    (options) =>
      new NativeRpcTransport({
        ...options,
        executable: process.execPath,
        args: ['-e', 'process.exit(9)'],
        requestTimeoutMs: 1000,
      }),
  );
  expect(await driver.probe()).toMatchObject({ status: 'unavailable' });
});
it('reports a native authentication failure as requiring login', async () => {
  const driver = new PiDriver(
    connection,
    tmpdir(),
    (options) =>
      new NativeRpcTransport({
        ...options,
        executable: process.execPath,
        args: [
          '-e',
          `require('readline').createInterface({input:process.stdin}).on('line', line => {
            const frame = JSON.parse(line);
            process.stdout.write(JSON.stringify({type:'response', id:frame.id, success:false, error:'401 unauthorized'})+'\\n');
          });`,
        ],
        requestTimeoutMs: 1000,
      }),
  );
  expect(await driver.probe()).toEqual({
    status: 'login_required',
    message: new LocalAgentError('LOCAL_AGENT_LOGIN_REQUIRED').message,
  });
});
it('expires a timed native UI request and rejects a late answer', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'memoflow-pi-expiry-'));
  const driver = new PiDriver(
    { ...connection, homePath: cwd },
    cwd,
    (options) =>
      new NativeRpcTransport({
        ...options,
        executable: process.execPath,
        args: [
          '-e',
          `
      const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
      require('readline').createInterface({input:process.stdin}).on('line', line => {
        const f=JSON.parse(line); const reply=data=>send({type:'response',id:f.id,success:true,data});
        if(f.type==='get_state') reply({sessionId:'native'});
        else if(f.type==='get_available_models') reply({models:[{id:'model',provider:'provider',name:'Model'}]});
        else if(f.type==='set_model') reply({});
        else if(f.type==='prompt') { reply({});send({type:'extension_ui_request',id:'q',method:'confirm',title:'Allow?',timeout:20}); setTimeout(()=>send({type:'agent_settled'}),100); }
      });`,
        ],
        requestTimeoutMs: 1000,
      }),
  );
  try {
    let id = '';
    const events = [];
    for await (const event of driver.run({ modelId: 'provider/model', content: 'Hello' })) {
      events.push(event);
      if (event.type === 'request') id = event.request.requestId;
    }
    expect(events).toContainEqual({
      type: 'request_resolved',
      requestId: id,
      resolution: 'cancelled',
    });
    expect(driver.respond(id, { type: 'permission', decision: 'approve_once' })).toBe(false);
  } finally {
    await driver.close();
    await rm(cwd, { recursive: true, force: true });
  }
});
