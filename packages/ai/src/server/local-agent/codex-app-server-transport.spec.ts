import { afterEach, describe, expect, it } from 'vitest';
import { NativeRpcTransport } from './native-rpc-transport';

const clients: NativeRpcTransport[] = [];
function client(script: string, requestTimeoutMs = 1000) {
  const transport = new NativeRpcTransport({
    executable: process.execPath,
    args: ['-e', script],
    cwd: process.cwd(),
    requestTimeoutMs,
  });
  clients.push(transport);
  return transport;
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((transport) => transport.close()));
});

describe('Codex stdio transport with real child processes', () => {
  it('correlates fragmented UTF-8 JSON replies and bounds request lifetime', async () => {
    const transport = client(`
      require('readline').createInterface({input: process.stdin}).on('line', line => {
        const request = JSON.parse(line);
        const response = Buffer.from(JSON.stringify({id: request.id, result: { text: '身体' }}) + '\\n');
        process.stdout.write(response.subarray(0, response.length - 5));
        setTimeout(() => process.stdout.write(response.subarray(response.length - 5)), 5);
      });
    `);
    expect(await transport.request('initialize', {})).toEqual({ text: '身体' });
    const silent = client('process.stdin.resume()', 30);
    await expect(silent.request('initialize', {})).rejects.toMatchObject({
      code: 'LOCAL_AGENT_UNAVAILABLE',
    });
  });

  it('rejects pending requests on nonzero exit without exposing stderr', async () => {
    const transport = client(
      `process.stdin.once('data', () => { process.stderr.write('secret-in-stderr'); process.exit(7); });`,
    );
    await expect(transport.request('initialize', {})).rejects.toMatchObject({
      code: 'LOCAL_AGENT_UNAVAILABLE',
      message: expect.not.stringContaining('secret'),
    });
  });

  it('rejects unsupported server requests so the native Agent cannot wait forever', async () => {
    const transport = client(`
      require('readline').createInterface({input: process.stdin}).on('line', line => {
        const frame = JSON.parse(line);
        if (frame.method) process.stdout.write(JSON.stringify({id: 'server-1', method: 'unknown/request', params: {}}) + '\\n');
        else if (frame.id === 'server-1') process.stdout.write(JSON.stringify({id: 1, result: frame.error.code}) + '\\n');
      });
    `);
    expect(await transport.request('initialize', {})).toBe(-32601);
  });

  it('terminates an oversized unterminated frame', async () => {
    const transport = client(
      `process.stdin.once('data', () => process.stdout.write('x'.repeat(2200000)));`,
    );
    await expect(transport.request('initialize', {})).rejects.toMatchObject({
      code: 'LOCAL_AGENT_PROTOCOL_ERROR',
    });
  });
});
