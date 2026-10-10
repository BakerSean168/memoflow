import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { NativeRpcTransport } from './native-rpc-transport';

it('frames ACP v1 requests, notifications, and permission responses as JSON-RPC 2.0', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'memoflow-acp-wire-'));
  const script = join(cwd, 'fake-acp.mjs');
  await writeFile(
    script,
    `import readline from 'node:readline';
    const read = readline.createInterface({input:process.stdin});
    let pendingPrompt;
    for await (const line of read) {
      const value = JSON.parse(line);
      if (value.jsonrpc !== '2.0') process.exit(61);
      if (value.method === 'initialize') {
        process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:value.id,result:{protocolVersion:1}})+'\\n');
      } else if (value.method === 'session/prompt') {
        pendingPrompt=value.id;
        process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'session/update',params:{sessionId:'acp',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'delta'}}}})+'\\n');
        process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:731,method:'session/request_permission',params:{sessionId:'acp',toolCall:{toolCallId:'call'},options:[{optionId:'allow-once',kind:'allow_once',name:'Allow once'}]}})+'\\n');
      } else if (value.id === 731 && value.result) {
        process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:pendingPrompt,result:{approved:value.result.outcome.optionId}})+'\\n');
      } else if (value.method === 'session/cancel') {
        // Verified by JSON-RPC envelope assertion above.
      }
    }`,
  );
  const transport = new NativeRpcTransport({
    protocol: 'acp',
    executable: process.execPath,
    args: [script],
    cwd,
    requestTimeoutMs: 5_000,
  });
  try {
    expect(await transport.request('initialize', { protocolVersion: 1 })).toEqual({
      protocolVersion: 1,
    });
    const notifications: unknown[] = [];
    transport.onNotification = (method, params) => notifications.push({ method, params });
    transport.onRequest = (request) => {
      expect(request).toMatchObject({ id: 731, method: 'session/request_permission' });
      transport.respond(request.id, { outcome: { outcome: 'selected', optionId: 'allow-once' } });
    };
    const result = await transport.request('session/prompt', { sessionId: 'acp', prompt: [] });
    expect(result).toEqual({ approved: 'allow-once' });
    expect(notifications).toMatchObject([
      { method: 'session/update', params: { sessionId: 'acp' } },
    ]);
    transport.notify('session/cancel', { sessionId: 'acp' });
  } finally {
    await transport.close();
    await rm(cwd, { recursive: true, force: true });
  }
});
