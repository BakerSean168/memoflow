import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closePowerSyncHttpTransport, powerSyncHttpFetch } from './powersync-http-transport';

describe('PowerSync Node HTTP transport compatibility', () => {
  let server: Server | null = null;

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await closePowerSyncHttpTransport();
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server!.close((error) => (error ? reject(error) : resolve())),
      );
      server = null;
    }
  });

  it('streams HTTP using the package-matched undici fetch even when native fetch fails', async () => {
    let receivedMethod = '';
    let receivedAuthorization = '';
    let receivedAccept = '';
    server = createServer((request, response) => {
      receivedMethod = request.method ?? '';
      receivedAuthorization = request.headers.authorization ?? '';
      receivedAccept = request.headers.accept ?? '';
      request.resume();
      response.writeHead(200, { 'content-type': 'application/x-ndjson' });
      response.write('{"checkpoint":{"last_op_id":"1"}}\n');
      response.end('{"checkpoint_complete":{}}\n');
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    // This models Node/Electron native fetch rejecting an agent created by a
    // separately installed undici package. The SDK transport must not use it.
    const incompatibleNativeFetch = vi.fn(() =>
      Promise.reject(new TypeError('invalid onRequestStart method')),
    );
    vi.stubGlobal('fetch', incompatibleNativeFetch);
    vi.stubEnv('NO_PROXY', 'localhost,127.0.0.1');

    const response = await powerSyncHttpFetch(`http://127.0.0.1:${port}/sync/stream`, {
      method: 'POST',
      headers: {
        Authorization: 'Token test-only-credential',
        Accept: 'application/x-ndjson',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('checkpoint_complete');
    expect(receivedMethod).toBe('POST');
    expect(receivedAuthorization).toBe('Token test-only-credential');
    expect(receivedAccept).toBe('application/x-ndjson');
    expect(incompatibleNativeFetch).not.toHaveBeenCalled();
  });

  it('recreates a usable dispatcher after Profile shutdown', async () => {
    server = createServer((_request, response) => {
      response.writeHead(200);
      response.end('ready');
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    vi.stubEnv('NO_PROXY', 'localhost,127.0.0.1');
    const url = `http://127.0.0.1:${port}/probes/readiness`;
    const first = await powerSyncHttpFetch(url);
    expect(first.status).toBe(200);
    await first.text();
    await closePowerSyncHttpTransport();
    const second = await powerSyncHttpFetch(url);
    expect(second.status).toBe(200);
    await second.text();
  });
});
