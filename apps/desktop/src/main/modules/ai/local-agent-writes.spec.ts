import { expect, it } from 'vitest';
import { createPowerSyncSqliteFixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import { LocalAgentRepository } from '@memoflow/ai';
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
      identityId,
      connectionId: connection.id,
      conversationId: 'test',
      runId: 'read',
    });
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
    await store.updateConnection(identityId, connection.id, enabled.revision, {
      ...config,
      writeScopes: [],
    });
    expect((await call(grant, 'tools/call', params)).status).toBe(403);
    const afterRevocation = await bridge.open({
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
