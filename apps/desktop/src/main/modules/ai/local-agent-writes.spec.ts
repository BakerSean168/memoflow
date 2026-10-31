import { expect, it } from 'vitest';
import { createPowerSyncSqliteFixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import { LocalAgentRepository, PermissionLocalRepository } from '@memoflow/ai';
import { createTimeContext } from '@memoflow/time';
import { createDesktopLocalAgentTools } from './local-agent-tools';

it('advertises only authorized writes, commits through owners and refuses revoked replay', async () => {
  const f = createPowerSyncSqliteFixture();
  const store = new LocalAgentRepository(f.db);
  const bridge = createDesktopLocalAgentTools(f.db, store, () => true, {
    getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
  });
  const identityId = 'IdentityId_00000000-0000-4000-8000-000000000001';
  const config = {
    driver: 'codex' as const,
    name: 'MCP test',
    executablePath: 'codex',
    enabled: true,
    writeScopes: [],
  };
  async function call(grant: { url: string; token: string }, method: string, params: unknown = {}) {
    return fetch(grant.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${grant.token}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
  }
  try {
    const connection = await store.createConnection(identityId, config);
    const readGrant = await bridge.open({
      permissionMode: 'auto-approve',
      identityId,
      connectionId: connection.id,
      conversationId: 'test',
      runId: 'read',
    });
    const permissionSettings = f.sql
      .prepare('SELECT record_json FROM ai_permission_settings_local WHERE identity_id = ?')
      .get(identityId) as { record_json: string };
    expect(JSON.parse(permissionSettings.record_json)).toMatchObject({ preset: 'on_demand' });
    const discovery = await (await call(readGrant, 'tools/list')).text();
    expect(discovery).toContain('goal_search');
    expect(discovery).not.toContain('goal_create');
    expect(discovery).not.toContain('task_plan_create');
    readGrant.revoke();
    const enabled = await store.updateConnection(identityId, connection.id, connection.revision, {
      ...config,
      writeScopes: ['goals:write', 'tasks:write'],
    });
    const grant = await bridge.open({
      permissionMode: 'auto-approve',
      identityId,
      connectionId: connection.id,
      conversationId: 'test',
      runId: 'write',
    });
    const params = {
      name: 'goal_create',
      arguments: { idempotencyKey: 'goal', goal: { name: 'Through MCP' } },
    };
    const first = await (await call(grant, 'tools/call', params)).text();
    const permissionAudit = f.sql
      .prepare(
        'SELECT record_json FROM ai_permission_audit_local ORDER BY occurred_at DESC LIMIT 1',
      )
      .get() as { record_json: string };
    expect(JSON.parse(permissionAudit.record_json)).toMatchObject({
      operationId: 'goal.create',
      decision: 'allow',
    });
    expect(first).toContain('receiptId');
    expect(await (await call(grant, 'tools/call', params)).text()).toBe(first);
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM goals').get()).toMatchObject({ n: 1 });
    const plan = await (
      await call(grant, 'tools/call', {
        name: 'task_plan_create',
        arguments: {
          idempotencyKey: 'task',
          plan: {
            name: 'MCP Task',
            importance: 'Moderate',
            schedule: {
              kind: 'OneTime',
              date: new Date().toISOString().slice(0, 10),
              timing: { kind: 'AllDay' },
            },
          },
        },
      })
    ).text();
    expect(plan).toContain('receiptId');
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_plans').get()).toMatchObject({ n: 1 });
    const ambiguous = await bridge.open({
      permissionMode: 'auto-approve',
      identityId,
      connectionId: connection.id,
      conversationId: 'test',
      runId: 'ambiguous',
      goalIntent: '帮我备战 2027 年考研，目标北京大学',
    });
    const rejected = await (
      await call(ambiguous, 'tools/call', {
        name: 'goal_create',
        arguments: { idempotencyKey: 'ambiguous-goal', goal: { name: '2027 考研' } },
      })
    ).text();
    expect(rejected).toContain('GOAL_CLARIFICATION_REQUIRED');
    const discussOnly = await bridge.open({
      permissionMode: 'auto-approve',
      identityId,
      connectionId: connection.id,
      conversationId: 'test',
      runId: 'discuss-only',
      goalIntent: '先讨论一下考研规划，不要创建',
    });
    expect(
      await (
        await call(discussOnly, 'tools/call', {
          name: 'goal_create',
          arguments: { idempotencyKey: 'discuss-goal', goal: { name: '考研规划' } },
        })
      ).text(),
    ).toContain('GOAL_DISCUSSION_ONLY');
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM goals').get()).toMatchObject({ n: 1 });
    await store.updateConnection(identityId, connection.id, enabled.revision, {
      ...config,
      writeScopes: [],
    });
    expect((await call(grant, 'tools/call', params)).status).toBe(403);
    const afterRevocation = await bridge.open({
      permissionMode: 'auto-approve',
      identityId,
      connectionId: connection.id,
      conversationId: 'test',
      runId: 'revoked',
    });
    expect(await (await call(afterRevocation, 'tools/list')).text()).not.toContain('goal_create');
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM goal_operation_receipts').get()).toMatchObject({
      n: 1,
    });
  } finally {
    await bridge.dispose();
    f.close();
  }
});

it('requires business approval for direct Goal and Task writes without inserting data on denial', async () => {
  const f = createPowerSyncSqliteFixture();
  const store = new LocalAgentRepository(f.db);
  const bridge = createDesktopLocalAgentTools(f.db, store, () => true, {
    getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
  });
  const requested: string[] = [];
  try {
    const connection = await store.createConnection(
      'IdentityId_00000000-0000-4000-8000-000000000001',
      {
        driver: 'codex',
        name: 'Codex',
        executablePath: 'codex',
        enabled: true,
        writeScopes: ['goals:write', 'tasks:write'],
      },
    );
    await new PermissionLocalRepository(f.db).saveSettings(
      'IdentityId_00000000-0000-4000-8000-000000000001',
      {
        preset: 'confirm_each',
        agentPresets: { [connection.id]: 'confirm_each' },
        revision: 1,
      },
    );
    const grant = await bridge.open({
      identityId: 'IdentityId_00000000-0000-4000-8000-000000000001',
      connectionId: connection.id,
      conversationId: 'chat',
      runId: 'run',
      permissionMode: 'supervised',
      requestApproval: async (name) => {
        requested.push(name);
        return false;
      },
    });
    for (const [name, args] of [
      ['goal_create', { idempotencyKey: 'goal', goal: { name: 'Denied Goal' } }],
      [
        'task_plan_create',
        {
          idempotencyKey: 'task',
          plan: {
            name: 'Denied Task',
            importance: 'Moderate',
            schedule: { kind: 'OneTime', date: '2026-11-01', timing: { kind: 'AllDay' } },
          },
        },
      ],
    ] as const) {
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
          params: { name, arguments: args },
        }),
      });
      expect(await result.text()).toContain('PERMISSION_DENIED');
    }
    expect(requested).toEqual(['goal_create', 'task_plan_create']);
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM goals').get()).toMatchObject({ n: 0 });
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_plans').get()).toMatchObject({ n: 0 });
  } finally {
    await bridge.dispose();
    f.close();
  }
});
