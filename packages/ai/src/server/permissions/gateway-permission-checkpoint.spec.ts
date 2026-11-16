import { PermissionStorageUnavailableError } from './permission.repository';
import { afterEach, expect, it, vi } from 'vitest';
import { createReadGateway } from '@memoflow/agent-gateway/server';
import { createLocalAgentSqlite } from '../../testing/local-agent-sqlite';
import { PermissionLocalRepository } from './permission-powersync.repository';
import { createGatewayPermissionCheckpoint } from './gateway-permission-checkpoint';

const databases: ReturnType<typeof createLocalAgentSqlite>[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
function fixture() {
  const db = createLocalAgentSqlite();
  databases.push(db);
  const repository = new PermissionLocalRepository(db);
  const principal = {
    identityId: 'owner',
    credentialId: 'pat',
    credentialType: 'pat' as const,
    scopes: ['goals:write', 'goals:read'],
  };
  const authenticate = vi.fn(async () => principal);
  const create = vi.fn(async () => ({
    receiptId: 'a'.repeat(64),
    replayed: false,
    result: {
      goalId: '5b5d8a2b-9934-4be8-8e07-3f62ed122e15',
      goalVersion: 1,
      affectedEntityIds: { goalIds: [], keyResultIds: [], recordIds: [], reviewIds: [] },
    },
  }));
  const update = vi.fn(async () => ({
    receiptId: 'a'.repeat(64),
    replayed: false,
    result: {
      goalId: '5b5d8a2b-9934-4be8-8e07-3f62ed122e15',
      goalVersion: 1,
      affectedEntityIds: { goalIds: [], keyResultIds: [], recordIds: [], reviewIds: [] },
    },
  }));
  const unused = vi.fn();
  const gateway = createReadGateway({
    enabled: true,
    toolCheckpoint: createGatewayPermissionCheckpoint(repository),
    audience: 'https://memo.test/mcp',
    trustedOrigins: [],
    cursorSecret: 'fixture-only-'.repeat(4),
    credentials: { authenticate, consumeReadQuota: async () => true },
    consumeOwnerQuota: async () => true,
    audit: vi.fn(),
    goals: { getGoal: unused, searchGoalPage: unused },
    writes: {
      goalCreate: create as never,
      goalUpdate: update as never,
      keyResultCreate: unused,
      keyResultUpdate: unused,
      taskCreate: unused,
      taskUpdate: unused,
      taskComplete: unused,
    },
  });
  const fetch = (name: string, args: unknown) =>
    gateway.fetch(
      new Request('https://memo.test/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2026-07-28',
          'Mcp-Method': 'tools/call',
          'Mcp-Name': name,
          authorization: 'Bearer fixture',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name,
            arguments: args,
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientInfo': { name: 'fixture', version: '1' },
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      }),
      { requestId: 'r', traceId: 't', startedAt: Date.now(), source: 'http' },
    );
  return { repository, principal, authenticate, create, update, fetch };
}
const goalId = '5b5d8a2b-9934-4be8-8e07-3f62ed122e15';
const createInput = { idempotencyKey: 'create', goal: { name: 'Goal' } };
const updateInput = {
  idempotencyKey: 'update',
  goalId,
  changes: { name: 'Changed', expectedVersion: 1 },
};

it('pre-authorizes a scoped PAT write, keeps explicit denies, and preserves the scope ceiling', async () => {
  const f = fixture();
  // Default confirm_each would ask; the issued goals:write scope supplies the grant.
  const created = await f.fetch('goal_create', createInput);
  expect(await created.text()).not.toContain('PERMISSION_DENIED');
  expect(f.create).toHaveBeenCalledOnce();
  const updated = await f.fetch('goal_update', updateInput);
  expect(await updated.text()).not.toContain('PERMISSION_DENIED');
  expect(f.update).toHaveBeenCalledOnce();
  await f.repository.saveRule('owner', {
    id: 'update-denied',
    agentId: null,
    object: 'goal',
    action: 'update',
    effect: 'deny',
    source: 'user',
  });
  const denied = await f.fetch('goal_update', updateInput);
  const body = await denied.text();
  expect(body).toContain('PERMISSION_DENIED');
  expect(body).toContain('请在 MemoFlow 设置 → AI 权限里授权');
  expect(body).toContain('Settings → AI Permissions');
  expect(f.update).toHaveBeenCalledOnce();
  expect(await f.repository.listAudit('owner')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        agentId: 'external-mcp:pat',
        operationId: 'goal.create',
        decision: 'allow',
      }),
      expect.objectContaining({
        agentId: 'external-mcp:pat',
        operationId: 'goal.update',
        decision: 'deny',
      }),
    ]),
  );
  f.principal.scopes = ['goals:read'];
  expect((await f.fetch('goal_create', createInput)).status).toBe(403);
  expect(f.create).toHaveBeenCalledOnce();
});

it('denies OAuth writes, out-of-scope PAT writes and unregistered operations at the checkpoint', async () => {
  const f = fixture();
  const checkpoint = createGatewayPermissionCheckpoint(f.repository);
  const work = vi.fn(async () => 'ok');
  const oauth = { ...f.principal, credentialType: 'oauth' as const, scopes: ['goals:read'] };
  expect(await checkpoint(oauth, 'goal_get', work)).toBe('ok');
  await expect(checkpoint(oauth, 'goal_create', work)).rejects.toMatchObject({
    code: 'PERMISSION_DENIED',
    decision: 'ask',
  });
  await expect(
    checkpoint({ ...f.principal, scopes: ['tasks:write'] }, 'goal_create', work),
  ).rejects.toMatchObject({ code: 'PERMISSION_DENIED', decision: 'ask' });
  await expect(checkpoint(f.principal, 'unregistered_write', work)).rejects.toMatchObject({
    code: 'PERMISSION_DENIED',
    decision: 'deny',
  });
  expect(work).toHaveBeenCalledOnce();
  expect(await f.repository.listAudit('owner')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ operationId: 'goal.create', decision: 'ask' }),
      expect.objectContaining({ operationId: 'unregistered_write', decision: 'deny' }),
    ]),
  );
});

it('honors per-connection user allows and explicit denies even in full auto', async () => {
  const f = fixture();
  await f.repository.saveRule('owner', {
    id: 'allow',
    agentId: 'external-mcp:pat',
    object: 'goal',
    action: 'update',
    effect: 'allow',
    source: 'user',
  });
  await f.fetch('goal_update', updateInput);
  expect(f.update).toHaveBeenCalledOnce();
  await f.repository.saveSettings('owner', { preset: 'full_auto', agentPresets: {}, revision: 1 });
  await f.repository.saveRule('owner', {
    id: 'deny',
    agentId: null,
    object: 'goal',
    action: 'update',
    effect: 'deny',
    source: 'user',
  });
  expect(await (await f.fetch('goal_update', updateInput)).text()).toContain('PERMISSION_DENIED');
  expect(f.update).toHaveBeenCalledOnce();
});

it('fails closed on cloud writes when permission tables are absent and propagates real failures', async () => {
  const f = fixture();
  for (const method of ['getSettings', 'listRules', 'appendAudit', 'updateAuditExecution'] as const)
    vi.spyOn(f.repository, method).mockRejectedValue(new PermissionStorageUnavailableError());
  expect(await (await f.fetch('goal_create', createInput)).text()).toContain('PERMISSION_DENIED');
  expect(f.create).not.toHaveBeenCalled();
  expect(await (await f.fetch('goal_update', updateInput)).text()).toContain('PERMISSION_DENIED');
  expect(f.update).not.toHaveBeenCalled();
  vi.spyOn(f.repository, 'getSettings').mockRejectedValue(new Error('offline'));
  expect(await (await f.fetch('goal_create', createInput)).text()).toContain('INTERNAL_ERROR');
  expect(f.create).not.toHaveBeenCalled();
});

function notificationFixture() {
  const db = createLocalAgentSqlite();
  databases.push(db);
  const repository = new PermissionLocalRepository(db);
  const principal = {
    identityId: 'owner',
    credentialId: 'pat',
    credentialType: 'pat' as const,
    scopes: ['notifications:read', 'notifications:write'],
  };
  const authenticate = vi.fn(async () => principal);
  const markAsRead = vi.fn(async () => ({
    id: 'notification-1',
    isRead: true,
    readAt: 9,
    version: 2,
    updatedAt: 10,
  }));
  const unused = vi.fn();
  const gateway = createReadGateway({
    enabled: true,
    toolCheckpoint: createGatewayPermissionCheckpoint(repository),
    audience: 'https://memo.test/mcp',
    trustedOrigins: [],
    cursorSecret: 'fixture-only-'.repeat(4),
    credentials: { authenticate, consumeReadQuota: async () => true },
    consumeOwnerQuota: async () => true,
    audit: vi.fn(),
    goals: { getGoal: unused, searchGoalPage: unused },
    notification: {
      listNotifications: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false,
      }),
      getUnreadCount: async () => 0,
    },
    writes: {
      goalCreate: unused,
      goalUpdate: unused,
      keyResultCreate: unused,
      keyResultUpdate: unused,
      taskCreate: unused,
      taskUpdate: unused,
      taskComplete: unused,
      notificationMarkRead: markAsRead as never,
    },
  });
  const fetch = (name: string, args: unknown) =>
    gateway.fetch(
      new Request('https://memo.test/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2026-07-28',
          'Mcp-Method': 'tools/call',
          'Mcp-Name': name,
          authorization: 'Bearer fixture',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name,
            arguments: args,
            _meta: {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientInfo': { name: 'fixture', version: '1' },
              'io.modelcontextprotocol/clientCapabilities': {},
            },
          },
        }),
      }),
      { requestId: 'r', traceId: 't', startedAt: Date.now(), source: 'http' },
    );
  return { repository, principal, markAsRead, fetch };
}

it('pre-authorizes notification mark-read through the registered write scope only', async () => {
  const f = notificationFixture();
  // Default confirm_each would ask; the issued notifications:write scope grants it.
  expect(
    await (await f.fetch('notification_mark_read', { id: 'notification-1' })).text(),
  ).not.toContain('PERMISSION_DENIED');
  expect(f.markAsRead).toHaveBeenCalledOnce();
  expect(await f.repository.listAudit('owner')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        agentId: 'external-mcp:pat',
        operationId: 'notification.update',
        decision: 'allow',
      }),
    ]),
  );
  await f.repository.saveRule('owner', {
    id: 'mark-read-denied',
    agentId: null,
    object: 'notification',
    action: 'update',
    effect: 'deny',
    source: 'user',
  });
  expect(
    await (await f.fetch('notification_mark_read', { id: 'notification-1' })).text(),
  ).toContain('PERMISSION_DENIED');
  expect(f.markAsRead).toHaveBeenCalledOnce();
  f.principal.scopes = ['notifications:read'];
  expect((await f.fetch('notification_mark_read', { id: 'notification-1' })).status).toBe(403);
  expect(f.markAsRead).toHaveBeenCalledOnce();
});

it('keeps notification execute-action outside the pre-authorized write set', async () => {
  const f = notificationFixture();
  const checkpoint = createGatewayPermissionCheckpoint(f.repository);
  const work = vi.fn(async () => 'ok');
  await expect(checkpoint(f.principal, 'notification_execute_action', work)).rejects.toMatchObject({
    code: 'PERMISSION_DENIED',
    decision: 'ask',
  });
  expect(work).not.toHaveBeenCalled();
});
