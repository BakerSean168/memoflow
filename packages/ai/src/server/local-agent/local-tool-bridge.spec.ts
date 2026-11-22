import { PermissionSettingsSchema } from '@memoflow/ai-contracts';
import { createServer, request as httpRequest } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect, vi } from 'vitest';
import { z } from 'zod';
import { LocalAgentToolBridge } from './local-tool-bridge';
import { LocalAgentRepository } from '../infrastructure/adapters/powersync/local-agent.repository';
import { LocalMcpClientRepository } from '../infrastructure/adapters/powersync/local-mcp-client.repository';
import { createLocalAgentSqlite } from '../../testing/local-agent-sqlite';
import { PermissionLocalRepository } from '../permissions/permission-powersync.repository';

async function discover(directory: string) {
  const discoveryPath = join(directory, 'endpoint.json');
  const raw = await readFile(discoveryPath, 'utf8');
  return {
    discoveryPath,
    discovery: JSON.parse(raw) as { url: string; hint?: string },
  };
}

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
    permissions: new PermissionLocalRepository(db),
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
    permissions: new PermissionLocalRepository(db),
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

it.each(['timeout', 'missing-handler'] as const)(
  'denies %s business approval before executing a write',
  async (reason) => {
    const db = createLocalAgentSqlite();
    const store = new LocalAgentRepository(db);
    const connection = await store.createConnection('owner', {
      driver: 'codex',
      name: 'Codex',
      executablePath: 'codex',
      enabled: true,
      writeScopes: ['goals:write'],
    });
    const permissions = new PermissionLocalRepository(db);
    await permissions.saveSettings('owner', {
      preset: 'confirm_each',
      agentPresets: {},
      revision: 1,
    });
    let writes = 0;
    const bridge = new LocalAgentToolBridge({
      store,
      permissions,
      isActive: () => true,
      approvalTimeoutMs: 10,
      registerTools(server, context) {
        server.registerTool('goal_panel_submit', { inputSchema: z.object({}) }, async () => {
          try {
            await context.executeAuthorized('goal.create', 'goal_panel_submit', async () => {
              writes++;
              return 'saved';
            });
            return { content: [{ type: 'text', text: 'saved' }] };
          } catch (error) {
            return { isError: true, content: [{ type: 'text', text: (error as Error).message }] };
          }
        });
      },
    });
    try {
      const grant = await bridge.open({
        identityId: 'owner',
        connectionId: connection.id,
        conversationId: 'chat',
        runId: 'run',
        ...(reason === 'timeout'
          ? {
              permissionMode: 'approval-required' as const,
              requestApproval: () => new Promise<boolean>(() => {}),
            }
          : {}),
      });
      const result = await fetch(grant.url, {
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
          params: { name: 'goal_panel_submit', arguments: {} },
        }),
      });
      expect(await result.text()).toContain('PERMISSION_DENIED');
      expect(writes).toBe(0);
    } finally {
      await bridge.dispose();
      db.close();
    }
  },
);

it.each(['approve_once', 'approve_conversation', 'approve_always', 'decline'] as const)(
  'applies %s at the unified checkpoint and revokes persistent grants immediately',
  async (decision) => {
    const db = createLocalAgentSqlite();
    const store = new LocalAgentRepository(db);
    const repository = new PermissionLocalRepository(db);
    const connection = await store.createConnection('owner', {
      driver: 'codex',
      name: 'Codex',
      executablePath: 'codex',
      enabled: true,
      writeScopes: ['goals:write'],
    });
    let requests = 0;
    let writes = 0;
    const bridge = new LocalAgentToolBridge({
      store,
      permissions: repository,
      isActive: () => true,
      registerTools(server, context) {
        server.registerTool('save', { inputSchema: z.object({}) }, async () => {
          try {
            await context.executeAuthorized('goal.create', 'save', async () => {
              writes++;
            });
            return { content: [{ type: 'text', text: 'saved' }] };
          } catch {
            return { isError: true, content: [{ type: 'text', text: 'denied' }] };
          }
        });
      },
    });
    try {
      await bridge.permissions('owner', {
        action: 'settings',
        settings: {
          preset: 'confirm_each',
          agentPresets: {},
          revision: 1,
        },
      });
      const open = (conversationId: string) =>
        bridge.open({
          identityId: 'owner',
          connectionId: connection.id,
          conversationId,
          runId: 'run',
          requestApproval: async (_tool, _signal, business) => {
            requests++;
            expect(business).toMatchObject({
              agentId: connection.id,
              object: 'goal',
              action: 'create',
            });
            expect(business!.expiresAt).toBeGreaterThan(Date.now());
            return decision;
          },
        });
      const grant = await open('chat');
      const call = async (grant: Awaited<ReturnType<typeof open>>) => {
        const response = await fetch(grant.url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${grant.token}`,
            accept: 'application/json, text/event-stream',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: requests + 1,
            method: 'tools/call',
            params: { name: 'save', arguments: {} },
          }),
        });
        return response.text();
      };
      await call(grant);
      await call(grant);
      expect(writes).toBe(decision === 'decline' ? 0 : 2);
      expect(requests).toBe(['approve_conversation', 'approve_always'].includes(decision) ? 1 : 2);
      const snapshot = await bridge.permissions('owner', { action: 'snapshot' });
      expect(snapshot.audit).toHaveLength(2);
      expect(snapshot.rules.filter((rule) => rule.source === 'user')).toHaveLength(0);
      if (decision === 'approve_always') {
        // Persistent approval now appears as the same per-object write exception
        // the user can inspect and change in Settings -> AI Provider.
        expect(snapshot.settings.preset).toBe('custom');
        expect(snapshot.settings.customMatrix?.goal).toMatchObject({
          read: 'allow',
          create: 'allow',
          update: 'allow',
          delete: 'allow',
        });
        expect(snapshot.settings.customMatrix?.task).toMatchObject({
          read: 'allow',
          create: 'ask',
          update: 'ask',
          delete: 'ask',
        });
        await bridge.permissions('owner', {
          action: 'settings',
          settings: { ...snapshot.settings, preset: 'confirm_each', customMatrix: undefined },
        });
        await call(grant);
        expect(requests).toBe(2);
      }
      if (decision === 'approve_conversation') {
        // Grants survive separate Agent turns, but do not escape their conversation.
        grant.revoke();
        await call(await open('chat'));
        expect(requests).toBe(1);
        await call(await open('another-chat'));
        expect(requests).toBe(2);
        await bridge.permissions('owner', {
          action: 'conversation',
          conversationId: 'chat',
          preset: null,
        });
        await call(await open('chat'));
        expect(requests).toBe(3);
      }
      expect(
        (await bridge.permissions('another-owner', { action: 'snapshot' })).rules,
      ).toHaveLength(0);
    } finally {
      await bridge.dispose();
      db.close();
    }
  },
);

it('keeps temporary raised presets out of persisted global settings', async () => {
  const db = createLocalAgentSqlite();
  const store = new LocalAgentRepository(db);
  const repository = new PermissionLocalRepository(db);
  const bridge = new LocalAgentToolBridge({
    store,
    permissions: repository,
    isActive: () => true,
    registerTools() {},
  });
  try {
    await bridge.permissions('owner', {
      action: 'settings',
      settings: { preset: 'read_only', agentPresets: {}, revision: 1 },
    });
    const state = await bridge.permissions('owner', {
      action: 'conversation',
      conversationId: 'chat',
      preset: 'full_auto',
    });
    expect(state.settings.preset).toBe('read_only');
    await bridge.permissions('owner', {
      action: 'conversation',
      conversationId: 'chat',
      preset: null,
    });
    expect((await bridge.permissions('owner', { action: 'snapshot' })).settings.preset).toBe(
      'read_only',
    );
  } finally {
    await bridge.dispose();
    db.close();
  }
});

it('replaces old matrix prohibitions when the user selects a new global preset', async () => {
  const db = createLocalAgentSqlite();
  const store = new LocalAgentRepository(db);
  const repository = new PermissionLocalRepository(db);
  const bridge = new LocalAgentToolBridge({
    store,
    permissions: repository,
    isActive: () => true,
    registerTools() {},
  });
  try {
    const objects = [
      'goal',
      'key_result',
      'task',
      'routine',
      'knowledge',
      'notification',
      'ai_permission',
    ];
    const customMatrix = Object.fromEntries(
      objects.map((object) => [
        object,
        { read: 'allow', create: 'deny', update: 'ask', delete: 'ask' },
      ]),
    );
    const settings = PermissionSettingsSchema.parse({ preset: 'custom', customMatrix });
    const first = await bridge.permissions('owner', { action: 'settings', settings });
    expect(first.rules).toContainEqual(
      expect.objectContaining({ id: 'matrix:goal:create', effect: 'deny', agentId: null }),
    );
    const raised = await bridge.permissions('owner', {
      action: 'settings',
      settings: { ...first.settings, preset: 'full_auto' },
    });
    expect(raised.rules.some((rule) => rule.id.startsWith('matrix:'))).toBe(false);
    expect(raised.settings.preset).toBe('full_auto');
  } finally {
    await bridge.dispose();
    db.close();
  }
});

it('makes legacy tools visible after settings changes without discarding migrated denials', async () => {
  const db = createLocalAgentSqlite();
  const store = new LocalAgentRepository(db);
  const repository = new PermissionLocalRepository(db);
  const connection = await store.createConnection('owner', {
    driver: 'codex',
    name: 'Codex',
    executablePath: 'codex',
    enabled: true,
    writeScopes: [],
  });
  // A legacy connection predates this bridge's migration checkpoint.
  await new Promise((resolve) => setTimeout(resolve, 2));
  const bridge = new LocalAgentToolBridge({
    store,
    permissions: repository,
    isActive: () => true,
    registerTools() {},
  });
  try {
    const migrated = await bridge.permissions('owner', { action: 'snapshot' });
    expect(migrated.rules).toContainEqual(
      expect.objectContaining({ id: `legacy:${connection.id}:goal:create`, effect: 'deny' }),
    );
    const changed = await bridge.permissions('owner', {
      action: 'settings',
      settings: { ...migrated.settings, preset: 'full_auto' },
    });
    expect((await store.getConnection('owner', connection.id)).writeScopes).toEqual([
      'goals:write',
      'tasks:write',
    ]);
    expect(changed.rules).toEqual(migrated.rules);
    const revoked = await bridge.permissions('owner', {
      action: 'revoke',
      ruleId: `legacy:${connection.id}:goal:create`,
    });
    expect(revoked.rules.some((rule) => rule.id === `legacy:${connection.id}:goal:create`)).toBe(
      false,
    );
    expect(revoked.rules.some((rule) => rule.object === 'task' && rule.effect === 'deny')).toBe(
      true,
    );
  } finally {
    await bridge.dispose();
    db.close();
  }
});

it.each([
  ['goal.delete_permanent', 'full_auto', 'ask'],
  ['notification.send_external', 'full_auto', 'ask'],
  ['goal.create', 'read_only', 'deny'],
] as const)(
  'full-access preserves business %s under %s (%s)',
  async (operationId, preset, expected) => {
    const db = createLocalAgentSqlite();
    const store = new LocalAgentRepository(db);
    const permissions = new PermissionLocalRepository(db);
    const connection = await store.createConnection('owner', {
      driver: 'codex',
      name: 'Fixture',
      executablePath: 'codex',
      enabled: true,
      writeScopes: ['goals:write'],
    });
    let asks = 0;
    let executed = 0;
    const bridge = new LocalAgentToolBridge({
      store,
      permissions,
      isActive: () => true,
      registerTools(server, context) {
        server.registerTool('operation', { inputSchema: z.object({}) }, async () => {
          try {
            await context.executeAuthorized(operationId, 'operation', async () => {
              executed++;
            });
            return { content: [{ type: 'text', text: 'executed' }] };
          } catch {
            return {
              isError: true,
              content: [{ type: 'text', text: 'denied' }],
            };
          }
        });
      },
    });
    try {
      await bridge.permissions('owner', {
        action: 'settings',
        settings: { preset, agentPresets: {}, revision: 1 },
      });
      const grant = await bridge.open({
        identityId: 'owner',
        connectionId: connection.id,
        conversationId: 'chat',
        runId: 'r',
        permissionMode: 'full-access',
        requestApproval: async (_tool, _signal, business) => {
          asks++;
          expect(business).toBeDefined();
          return 'approve_once';
        },
      });
      for (let i = 0; i < 2; i++) {
        const response = await fetch(grant.url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${grant.token}`,
            accept: 'application/json, text/event-stream',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: i + 1,
            method: 'tools/call',
            params: { name: 'operation', arguments: {} },
          }),
        });
        expect(await response.text()).toContain(expected === 'deny' ? 'denied' : 'executed');
      }
      expect(asks).toBe(expected === 'ask' ? 2 : 0);
      expect(executed).toBe(expected === 'ask' ? 2 : 0);
      expect(await permissions.listAudit('owner')).toHaveLength(2);
    } finally {
      await bridge.dispose();
      db.close();
    }
  },
);

it('accepts a persistent external client token until it is revoked', async () => {
  const db = createLocalAgentSqlite();
  const store = new LocalAgentRepository(db);
  const clients = new LocalMcpClientRepository(db);
  const directory = await mkdtemp(join(tmpdir(), 'memoflow-mcp-'));
  const bridge = new LocalAgentToolBridge({
    store,
    permissions: new PermissionLocalRepository(db),
    isActive: () => true,
    clients,
    discoveryPath: join(directory, 'endpoint.json'),
    registerTools(server, context) {
      server.registerTool('owned_read', { inputSchema: z.object({}).strict() }, async () => {
        await context.authorize('goals:read');
        expect(context.origin).toBe('client');
        return { content: [{ type: 'text', text: context.connectionId }] };
      });
    },
  });
  const call = (url: string, token: string) =>
    fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'owned_read', arguments: {} },
      }),
    });
  try {
    const credential = await bridge.createMcpClient('owner', {
      name: 'Codex',
      writeScopes: ['tasks:write'],
    });
    expect(credential.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(credential.client.tokenPrefix).toBe(credential.token.slice(0, 8));
    expect(credential.client.writeScopes).toEqual(['tasks:write']);

    const first = await call(credential.endpoint.url, credential.token);
    expect(first.status).toBe(200);
    expect(await first.text()).toContain(credential.client.id);

    // The token survives process/run boundaries because the record, not a
    // grant, owns it; a second request still authenticates.
    expect((await call(credential.endpoint.url, credential.token)).status).toBe(200);

    const { discoveryPath, discovery } = await discover(directory);
    expect(discovery.url).toBe(credential.endpoint.url);
    expect((await stat(discoveryPath)).mode & 0o777).toBe(0o600);

    await bridge.revokeMcpClient('owner', credential.client.id);
    expect((await call(credential.endpoint.url, credential.token)).status).toBe(401);
    // Reloading the index from the Profile keeps the revocation authoritative.
    expect((await clients.list('owner'))[0]?.revokedAt).not.toBeNull();
  } finally {
    await bridge.dispose();
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it('re-checks external client write scopes on every call', async () => {
  const db = createLocalAgentSqlite();
  const store = new LocalAgentRepository(db);
  const clients = new LocalMcpClientRepository(db);
  const bridge = new LocalAgentToolBridge({
    store,
    permissions: new PermissionLocalRepository(db),
    isActive: () => true,
    clients,
    registerTools(server, context) {
      server.registerTool('write_task', { inputSchema: z.object({}).strict() }, async () => {
        try {
          await context.authorize('tasks:write');
          return { content: [{ type: 'text', text: 'allowed' }] };
        } catch {
          return { isError: true, content: [{ type: 'text', text: 'denied' }] };
        }
      });
    },
  });
  const call = (url: string, token: string) =>
    fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'write_task', arguments: {} },
      }),
    });
  try {
    const readOnly = await bridge.createMcpClient('owner', { name: 'Read', writeScopes: [] });
    expect(await (await call(readOnly.endpoint.url, readOnly.token)).text()).toContain('denied');

    const writer = await bridge.createMcpClient('owner', {
      name: 'Write',
      writeScopes: ['tasks:write'],
    });
    expect(await (await call(writer.endpoint.url, writer.token)).text()).toContain('allowed');
  } finally {
    await bridge.dispose();
    db.close();
  }
});

async function profileHost() {
  const db = createLocalAgentSqlite();
  const store = new LocalAgentRepository(db);
  const clients = new LocalMcpClientRepository(db);
  const directory = await mkdtemp(join(tmpdir(), 'memoflow-mcp-'));
  const discoveryPath = join(directory, 'endpoint.json');
  const hostPath = join(directory, 'host.json');
  const bridges: LocalAgentToolBridge[] = [];
  return {
    directory,
    discoveryPath,
    hostPath,
    clients,
    create() {
      const bridge = new LocalAgentToolBridge({
        store,
        permissions: new PermissionLocalRepository(db),
        isActive: () => true,
        clients,
        discoveryPath,
        registerTools(server, context) {
          server.registerTool('owned_read', { inputSchema: z.object({}).strict() }, async () => {
            await context.authorize('goals:read');
            return { content: [{ type: 'text', text: context.identityId }] };
          });
        },
      });
      bridges.push(bridge);
      return bridge;
    },
    async dispose() {
      for (const bridge of bridges) await bridge.dispose();
      db.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

it('keeps the copied MCP URL and persistent token usable after a Profile restart', async () => {
  const host = await profileHost();
  try {
    const first = host.create();
    const credential = await first.createMcpClient('owner', { name: 'External', writeScopes: [] });
    const url = credential.endpoint.url;
    expect((await discover(host.directory)).discovery.url).toBe(url);
    await first.dispose();
    await expect(readFile(host.discoveryPath, 'utf8')).rejects.toThrow();

    const second = host.create();
    await second.start();
    expect((await second.endpoint()).url).toBe(url);
    expect(JSON.parse(await readFile(host.hostPath, 'utf8'))).toEqual({
      version: 1,
      port: Number(new URL(url).port),
    });
    expect((await stat(host.hostPath)).mode & 0o777).toBe(0o600);
    // Repeated cleanup of an old instance cannot erase the new live discovery.
    await first.dispose();
    expect((await discover(host.directory)).discovery.url).toBe(url);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credential.token}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'owned_read', arguments: {} },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('owner');
  } finally {
    await host.dispose();
  }
});

it('keeps the saved MCP address on a port conflict and retries it after the listener is released', async () => {
  const host = await profileHost();
  const occupied = createServer();
  try {
    const first = host.create();
    await first.start();
    const url = (await first.endpoint()).url;
    await first.dispose();
    await new Promise<void>((resolve, reject) => {
      occupied.once('error', reject);
      occupied.listen(Number(new URL(url).port), '127.0.0.1', resolve);
    });
    const second = host.create();
    await expect(second.start()).rejects.toMatchObject({ code: 'LOCAL_MCP_PORT_IN_USE' });
    await expect(readFile(host.discoveryPath, 'utf8')).rejects.toThrow();
    expect(JSON.parse(await readFile(host.hostPath, 'utf8')).port).toBe(Number(new URL(url).port));
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
    expect((await second.endpoint()).url).toBe(url);
  } finally {
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
    await host.dispose();
  }
});

it('finishes startup before disposal removes discovery and closes the listener', async () => {
  const host = await profileHost();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const index = vi.spyOn(host.clients, 'listCredentials').mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
    return [];
  });
  const bridge = host.create();
  const starting = bridge.start().catch((error: unknown) => error);
  try {
    await entered.promise;
    const disposing = bridge.dispose();
    release.resolve();
    await Promise.all([starting, disposing]);
    await expect(readFile(host.discoveryPath, 'utf8')).rejects.toThrow();
    await expect(bridge.endpoint()).rejects.toThrow();
  } finally {
    release.resolve();
    index.mockRestore();
    await host.dispose();
  }
});

it('closes a partially started listener when discovery publication fails, then permits explicit retry', async () => {
  const host = await profileHost();
  const bridge = host.create();
  try {
    await mkdir(host.discoveryPath);
    await expect(bridge.start()).rejects.toThrow();
    const binding = JSON.parse(await readFile(host.hostPath, 'utf8')) as { port: number };
    const url = `http://127.0.0.1:${binding.port}/mcp`;
    await expect(fetch(url)).rejects.toThrow();
    await rm(host.discoveryPath, { recursive: true });
    expect((await bridge.endpoint()).url).toBe(url);
    expect((await discover(host.directory)).discovery.url).toBe(url);
  } finally {
    await host.dispose();
  }
});

it('rejects invalid saved bindings instead of silently giving existing clients a new address', async () => {
  const host = await profileHost();
  try {
    await writeFile(host.hostPath, JSON.stringify({ version: 1, port: 0 }));
    const bridge = host.create();
    await expect(bridge.start()).rejects.toMatchObject({ code: 'LOCAL_MCP_BINDING_INVALID' });
    await expect(readFile(host.discoveryPath, 'utf8')).rejects.toThrow();
    expect(JSON.parse(await readFile(host.hostPath, 'utf8')).port).toBe(0);
  } finally {
    await host.dispose();
  }
});

it('keeps the built-in per-run grant contract after the Profile host starts', async () => {
  const db = createLocalAgentSqlite();
  const store = new LocalAgentRepository(db);
  const connection = await store.createConnection('owner', {
    driver: 'codex',
    name: 'Codex',
    executablePath: 'codex',
    enabled: true,
    writeScopes: [],
  });
  const bridge = new LocalAgentToolBridge({
    store,
    permissions: new PermissionLocalRepository(db),
    isActive: () => true,
    clients: new LocalMcpClientRepository(db),
    registerTools(server, context) {
      server.registerTool('owned_read', { inputSchema: z.object({}).strict() }, async () => {
        await context.authorize('goals:read');
        expect(context.origin).toBe('run');
        return { content: [{ type: 'text', text: 'ok' }] };
      });
    },
  });
  try {
    await bridge.start();
    const grant = await bridge.open({
      identityId: 'owner',
      connectionId: connection.id,
      conversationId: 'chat',
      runId: 'run',
    });
    expect((await bridge.listMcpClients('owner')).length).toBe(0);
    const response = await fetch(grant.url, {
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
        params: { name: 'owned_read', arguments: {} },
      }),
    });
    expect(response.status).toBe(200);
    grant.revoke();
    const revoked = await fetch(grant.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${grant.token}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    expect(revoked.status).toBe(401);
  } finally {
    await bridge.dispose();
    db.close();
  }
});
