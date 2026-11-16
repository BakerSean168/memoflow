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
 * validates the contract enum (relations:read plus the eleven-scope ceiling) and
 * authentication enforces the scope allowlist, so neither side of the boundary
 * is bypassed by a mocked credential.
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
      findUnique: async ({ where: { tokenDigest } }: { where: { tokenDigest: string } }) =>
        [...rows.values()].find((row) => row.tokenDigest === tokenDigest) ?? null,
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
  const getNeighbors = vi.fn().mockResolvedValue({
    items: [
      {
        relationId: 'rel-1',
        relationType: 'related',
        direction: 'outgoing',
        targetNode: { type: 'knowledge', id: 'doc-1' },
        createdAt: 1000,
      },
    ],
    hasMore: false,
    nextCursor: null,
  });
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
    relations: { getNeighbors },
    audit,
  });
  return { gateway, getNeighbors, audit };
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

function pats() {
  return createScopedPatService({
    database: patDatabase(),
    audience,
    accountIsActive: async () => true,
  });
}

describe('PAT scope → hosted relation tools boundary (#994)', () => {
  it('allows relation_neighbors for a PAT holding relations:read', async () => {
    const service = pats();
    const issued = await service.create('5b5d8a2b-9934-4be8-8e07-3f62ed122e15', {
      name: 'relation reader',
      expiresInDays: 90,
      scopes: ['relations:read'],
    });
    expect(issued.scopes).toEqual(['relations:read']);
    const f = gatewayWith({
      authenticate: (authorization, context) => service.authenticate(authorization, context),
      consumeReadQuota: async () => true,
    });

    const response = await f.gateway.fetch(
      call(issued.secret, 'relation_neighbors', {
        node: { type: 'task', id: 'task-1' },
      }),
      requestContext,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: {
        structuredContent: {
          items: [{ relationId: 'rel-1', targetNode: { type: 'knowledge', id: 'doc-1' } }],
        },
      },
    });
    expect(f.getNeighbors).toHaveBeenCalledTimes(1);
  });

  it('rejects relation_neighbors for a PAT issued without relations:read', async () => {
    const service = pats();
    const issued = await service.create('6c6e9b3c-aa45-4cf9-9f18-4a73fe233f26', {
      name: 'goal reader',
      expiresInDays: 90,
      scopes: ['goals:read'],
    });
    const f = gatewayWith({
      authenticate: (authorization, context) => service.authenticate(authorization, context),
      consumeReadQuota: async () => true,
    });

    const response = await f.gateway.fetch(
      call(issued.secret, 'relation_neighbors', {
        node: { type: 'task', id: 'task-1' },
      }),
      requestContext,
    );
    expect(response.status).toBe(403);
    expect(f.getNeighbors).not.toHaveBeenCalled();
    expect(f.audit).toHaveBeenCalledWith(expect.objectContaining({ scopeDecision: 'denied' }));
  });

  it('accepts the eleven-scope ceiling including relations:read and rejects an unknown scope', async () => {
    const service = pats();
    const eleven = [
      'goals:read',
      'tasks:read',
      'goals:write',
      'tasks:write',
      'routines:write',
      'ai:read',
      'routines:read',
      'notifications:read',
      'notifications:write',
      'labels:read',
      'relations:read',
    ];
    const issued = await service.create('7d7fac4d-bb56-4d0a-af29-5b84ff344a37', {
      name: 'eleven scope',
      expiresInDays: 90,
      scopes: eleven,
    });
    expect(issued.scopes).toEqual(eleven);
    await expect(
      service.create('8e8ab15e-cc67-4e1b-b03a-6c9500555b48', {
        name: 'relation writer',
        expiresInDays: 90,
        scopes: ['relations:write'],
      }),
    ).rejects.toThrow();
  });
});
