import { PermissionSettingsSchema } from '@memoflow/ai-contracts';
import { request as httpRequest } from 'node:http';
import { it, expect } from 'vitest';
import { z } from 'zod';
import { LocalAgentToolBridge } from './local-tool-bridge';
import { LocalAgentRepository } from '../infrastructure/adapters/powersync/local-agent.repository';
import { createLocalAgentSqlite } from '../../testing/local-agent-sqlite';
import { PermissionLocalRepository } from '../permissions/permission-powersync.repository';

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
    await new Promise((resolve) => setTimeout(resolve, 2));
    let writes = 0;
    const bridge = new LocalAgentToolBridge({
      store,
      permissions: new PermissionLocalRepository(db),
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
              permissionMode: 'supervised' as const,
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
      snapshot.rules = snapshot.rules.filter((rule) => rule.source === 'user');
      expect(snapshot.rules).toHaveLength(decision === 'approve_always' ? 1 : 0);
      if (decision === 'approve_always') {
        expect(snapshot.rules[0]).toMatchObject({
          agentId: connection.id,
          object: 'goal',
          action: 'create',
          effect: 'allow',
          source: 'user',
          createdAt: expect.any(Number),
        });
        await bridge.permissions('owner', { action: 'revoke', ruleId: snapshot.rules[0]!.id });
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

it('stores matrix prohibitions as explicit rules that survive raised presets and can be revoked', async () => {
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
    expect(raised.rules).toHaveLength(6);
    const revoked = await bridge.permissions('owner', {
      action: 'revoke',
      ruleId: 'matrix:goal:create',
    });
    expect(revoked.rules.some((rule) => rule.id === 'matrix:goal:create')).toBe(false);
    expect(revoked.settings.customMatrix!.goal.create).toBe('allow');
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
