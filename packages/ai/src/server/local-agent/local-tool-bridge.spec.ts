import { request as httpRequest } from 'node:http';
import { it, expect } from 'vitest';
import { z } from 'zod';
import { LocalAgentToolBridge } from './local-tool-bridge';
import { LocalAgentRepository } from '../infrastructure/adapters/powersync/local-agent.repository';
import { createLocalAgentSqlite } from '../../testing/local-agent-sqlite';

it('drains a tool already using the Profile database before disposal returns', async () => {
  const db = createLocalAgentSqlite();
  const store = new LocalAgentRepository(db);
  const connection = await store.createConnection('owner', {
    driver: 'codex',
    name: 'Codex',
    executablePath: 'codex',
    enabled: true,
    writeScopes: [],
  });
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bridge = new LocalAgentToolBridge({
    store,
    isActive: () => true,
    registerTools(server, context) {
      server.registerTool('read', { inputSchema: z.object({}) }, async () => {
        await context.authorize('goals:read');
        await context.track(async () => {
          entered();
          await wait;
          await store.listConnections('owner');
        });
        return { content: [{ type: 'text', text: 'done' }] };
      });
    },
  });
  let call: Promise<unknown> | undefined;
  try {
    const grant = await bridge.open({
      identityId: 'owner',
      connectionId: connection.id,
      conversationId: 'chat',
      runId: 'run',
    });
    call = fetch(grant.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${grant.token}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'read', arguments: {} },
      }),
    })
      .then((result) => result.text())
      .catch(() => undefined);
    await started;
    let disposed = false;
    const disposal = bridge.dispose().then(() => {
      disposed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(disposed).toBe(false);
    release();
    await disposal;
  } finally {
    release();
    await call;
    await bridge.dispose();
    db.close();
  }
});

it('authenticates every native MCP call and revokes old Profile capabilities', async () => {
  const db = createLocalAgentSqlite();
  const store = new LocalAgentRepository(db);
  const connection = await store.createConnection('owner', {
    driver: 'codex',
    name: 'Codex',
    executablePath: 'codex',
    enabled: true,
    writeScopes: [],
  });
  let active = true;
  const bridge = new LocalAgentToolBridge({
    store,
    isActive: () => active,
    registerTools(server, context) {
      server.registerTool('owned_read', { inputSchema: z.object({}).strict() }, async () => {
        await context.authorize('goals:read');
        return { content: [{ type: 'text', text: context.identityId }] };
      });
    },
  });
  try {
    const grant = await bridge.open({
      identityId: 'owner',
      connectionId: connection.id,
      conversationId: 'chat',
      runId: 'run',
    });
    const call = (token = grant.token, headers: Record<string, string> = {}) =>
      fetch(grant.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'owned_read', arguments: {} },
        }),
      });
    const result = await call();
    expect(result.status).toBe(200);
    expect(await result.text()).toContain('owner');
    const contenders = await Promise.allSettled(
      Array.from({ length: 5 }, (_, index) =>
        bridge.open({
          identityId: 'owner',
          connectionId: connection.id,
          conversationId: 'chat',
          runId: `capacity-${index}`,
        }),
      ),
    );
    expect(contenders.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
    for (const contender of contenders)
      if (contender.status === 'fulfilled') contender.value.revoke();
    expect((await call('wrong')).status).toBe(401);
    expect((await call(grant.token, { origin: 'https://untrusted.test' })).status).toBe(403);
    const badHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(
        grant.url,
        { method: 'POST', headers: { host: 'untrusted.test' } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      request.on('error', reject);
      request.end();
    });
    expect(badHostStatus).toBe(403);
    grant.revoke();
    expect((await call()).status).toBe(401);
    const second = await bridge.open({
      identityId: 'owner',
      connectionId: connection.id,
      conversationId: 'chat',
      runId: 'second',
    });
    active = false;
    expect((await call(second.token)).status).toBe(401);
    await expect(
      bridge.open({
        identityId: 'owner',
        connectionId: connection.id,
        conversationId: 'chat',
        runId: 'late',
      }),
    ).rejects.toMatchObject({ code: 'LOCAL_AGENT_PERMISSION_DENIED' });
  } finally {
    await bridge.dispose();
    db.close();
  }
});
