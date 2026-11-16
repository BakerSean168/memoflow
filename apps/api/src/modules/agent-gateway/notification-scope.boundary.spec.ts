import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import { createScopedPatService } from '@memoflow/cloud-auth/server';
import { createReadGateway } from '@memoflow/agent-gateway/server';
import type { GatewayCredentialPort, GatewayToolCheckpoint } from '@memoflow/agent-gateway';

const audience = 'https://api.memo.test/mcp';
const requestContext = {
  requestId: 'request-a',
  traceId: 'trace-a',
  startedAt: Date.now(),
  source: 'http' as const,
};

/**
 * In-memory PAT table keeps the real Cloud Auth service in the loop: issuance
 * validates the contract enum and authentication enforces the scope allowlist
 * and the PAT ceiling, so this seam is not bypassed by a mocked credential.
 */
function patDatabase() {
  const rows = new Map<string, Record<string, unknown>>();
  const tx = {
    $executeRaw: async () => 1,
    externalAgentPat: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { createdAt: new Date(), revokedAt: null, ...data };
        rows.set(String(row.id), row);
        return row;
      },
      findUnique: async ({ where }: { where: { tokenDigest: string } }) =>
        [...rows.values()].find((row) => row.tokenDigest === where.tokenDigest) ?? null,
    },
    cloudAuthUser: { findUnique: async () => ({ disabledAt: null }) },
  };
  const database = {
    $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
    ...tx,
  } as unknown as PrismaClient;
  return database;
}

function gatewayWith(credentials: GatewayCredentialPort) {
  const listNotifications = vi.fn().mockResolvedValue({
    items: [
      {
        id: 'notification-1',
        workflowKey: 'goal.reminder',
        topic: 'goal',
        title: 'Goal reminder',
        content: 'Review the goal',
        contentTruncated: false,
        type: 'Reminder',
        category: 'Goal',
        importance: 'Moderate',
        urgency: 'Medium',
        isRead: false,
        readAt: null,
        archivedAt: null,
        createdAt: 1,
        updatedAt: 1,
        version: 1,
        relatedEntityType: null,
        relatedEntityId: null,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
    hasMore: false,
  });
  const getUnreadCount = vi.fn().mockResolvedValue(1);
  const audit = vi.fn();
  const gateway = createReadGateway({
    enabled: true,
    consumeOwnerQuota: async () => true,
    toolCheckpoint: (async (_principal, _tool, work) => work()) satisfies GatewayToolCheckpoint,
    audience,
    trustedOrigins: [],
    cursorSecret: 'test-only-secret-'.repeat(3),
    credentials,
    goals: {
      getGoal: async () => null,
      searchGoalPage: async () => ({ items: [], hasMore: false, next: null }),
    },
    notification: { listNotifications, getUnreadCount },
    audit,
  });
  return { gateway, listNotifications, getUnreadCount, audit };
}

function call(secret: string, name: string, args: Record<string, unknown> = {}) {
  return new Request(audience, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': name,
      authorization: `Bearer ${secret}`,
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
  });
}

describe('PAT scope → hosted notification tool boundary (#990)', () => {
  it('allows notification reads for an issued notifications:read PAT', async () => {
    const pats = createScopedPatService({
      database: patDatabase(),
      audience,
      accountIsActive: async () => true,
    });
    const identityId = '5b5d8a2b-9934-4be8-8e07-3f62ed122e15';
    const issued = await pats.create(identityId, {
      name: 'notification reader',
      expiresInDays: 90,
      scopes: ['notifications:read'],
    });
    expect(issued.scopes).toEqual(['notifications:read']);
    const f = gatewayWith({
      authenticate: (authorization, context) => pats.authenticate(authorization, context),
      consumeReadQuota: async () => true,
    });
    const response = await f.gateway.fetch(
      call(issued.secret, 'notification_list'),
      requestContext,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: { structuredContent: { items: [{ id: 'notification-1' }], total: 1 } },
    });
    const counted = await f.gateway.fetch(
      call(issued.secret, 'notification_unread_count'),
      requestContext,
    );
    expect(await counted.json()).toMatchObject({ result: { structuredContent: { count: 1 } } });
    expect(f.audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'OK' }));
  });

  it('rejects notification reads for a PAT issued without notifications:read', async () => {
    const pats = createScopedPatService({
      database: patDatabase(),
      audience,
      accountIsActive: async () => true,
    });
    const identityId = '6c6e9b3c-aa45-4cf9-9f18-4a73fe233f26';
    const issued = await pats.create(identityId, {
      name: 'goal reader',
      expiresInDays: 90,
      scopes: ['goals:read'],
    });
    const f = gatewayWith({
      authenticate: (authorization, context) => pats.authenticate(authorization, context),
      consumeReadQuota: async () => true,
    });
    const response = await f.gateway.fetch(
      call(issued.secret, 'notification_list'),
      requestContext,
    );
    expect(response.status).toBe(403);
    expect(f.listNotifications).not.toHaveBeenCalled();
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({ scopeDecision: 'denied', outcome: 'INSUFFICIENT_SCOPE' }),
    );
  });
});
