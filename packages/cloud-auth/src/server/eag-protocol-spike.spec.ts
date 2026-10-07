import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpExpressApp, originValidation } from '@modelcontextprotocol/express';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Isolated SDK fixture: no business implementation or public route is installed.
function fixture(legacy: 'reject' | 'stateless' = 'reject') {
  const handler = createMcpHandler(
    () => {
      const server = new McpServer({ name: 'eag-protocol-spike', version: '1.0.0' });
      server.registerTool(
        'echo',
        {
          inputSchema: z.strictObject({ message: z.string().max(64) }),
          outputSchema: z.strictObject({ message: z.string() }),
        },
        async ({ message }) => ({
          content: [{ type: 'text', text: message }],
          structuredContent: { message },
        }),
      );
      return server;
    },
    { legacy },
  );
  return handler;
}

function request(method: string, params: Record<string, unknown> = {}, headers = {}) {
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': method,
      ...(typeof params.name === 'string' ? { 'Mcp-Name': params.name } : {}),
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'eag-fixture', version: '1.0.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
}

describe('EAG-01 SDK protocol baseline', () => {
  it('discovers and calls with one independent POST and strict output', async () => {
    const handler = fixture();
    const listed = await handler.fetch(request('tools/list'));
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      result: { tools: [{ name: 'echo', outputSchema: { type: 'object' } }] },
    });
    const called = await handler.fetch(
      request('tools/call', { name: 'echo', arguments: { message: 'hello' } }),
    );
    expect(await called.json()).toMatchObject({
      result: { structuredContent: { message: 'hello' } },
    });
  });

  it('rejects mismatched header metadata and unsupported revision', async () => {
    const handler = fixture();
    const mismatch = await handler.fetch(
      request(
        'tools/call',
        { name: 'echo', arguments: { message: 'hello' } },
        { 'Mcp-Name': 'spoofed' },
      ),
    );
    expect(mismatch.status).toBe(400);
    const unsupported = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2099-01-01',
              'io.modelcontextprotocol/clientInfo': { name: 'fixture', version: '1.0.0' },
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      }),
    );
    expect(unsupported.status).toBe(400);
  });

  it('rejects legacy initialize explicitly', async () => {
    const response = await fixture().fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'fixture', version: '1' },
          },
        }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it('keeps SDK legacy stateless compatibility explicit and rejects invalid input', async () => {
    const initialized = await fixture('stateless').fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'legacy-fixture', version: '1' },
          },
        }),
      }),
    );
    expect(initialized.status).toBe(200);
    expect(initialized.headers.get('content-type')).toContain('text/event-stream');
    const legacyData = (await initialized.text())
      .split('\n')
      .find((line) => line.startsWith('data: '));
    if (!legacyData) throw new Error('Missing legacy SSE result');
    expect(JSON.parse(legacyData.slice(6))).toMatchObject({
      result: { protocolVersion: '2025-11-25' },
    });
    const invalid = await fixture().fetch(
      request('tools/call', {
        name: 'echo',
        arguments: { message: 'hello', identityId: 'spoofed' },
      }),
    );
    expect(await invalid.json()).toMatchObject({ result: { isError: true } });
  });

  it('runs the official client through Node and Express, rejecting untrusted Origin', async () => {
    const app = createMcpExpressApp({ host: '127.0.0.1' });
    app.use(originValidation(['localhost', '127.0.0.1']));
    const nodeHandler = toNodeHandler(fixture());
    app.post('/mcp', (req, res) => nodeHandler(req, res, req.body));
    const http = app.listen(0, '127.0.0.1');
    await once(http, 'listening');
    const address = http.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
    const client = new Client(
      { name: 'eag-client-spike', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    try {
      await client.connect(new StreamableHTTPClientTransport(url));
      expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['echo']);
      expect(await client.callTool({ name: 'echo', arguments: { message: 'node' } })).toMatchObject(
        { structuredContent: { message: 'node' } },
      );
      const denied = await fetch(url, {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'content-type': 'application/json' },
        body: '{}',
      });
      expect(denied.status).toBe(403);
    } finally {
      await client.close();
      http.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        http.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
