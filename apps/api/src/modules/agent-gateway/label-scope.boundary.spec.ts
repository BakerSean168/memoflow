import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import { createScopedPatService } from '@memoflow/cloud-auth/server';
import { createReadGateway } from '@memoflow/agent-gateway/server';
import type { GatewayCredentialPort, GatewayToolCheckpoint } from '@memoflow/agent-gateway';
import type { UserTimeContextPort } from '@memoflow/time';
import { bindGatewayWrites } from './write.port';

const audience = 'https://api.memo.test/mcp';
const requestContext = {
  requestId: 'request-a',
  traceId: 'trace-a',
  startedAt: Date.now(),
  source: 'http' as const,
};

/**
 * In-memory PAT table keeps the real Cloud Auth service in the loop: issuance
 * validates the contract enum (labels:read plus the ten-scope ceiling) and
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

function gatewayWith(credentials: GatewayCredentialPort, scopes: readonly string[]) {
  const list = vi
    .fn()
    .mockResolvedValue([
      { id: 'label-1', name: 'Work', color: '#ff0000', createdAt: 1, updatedAt: 1 },
    ]);
  const resolveNames = vi
    .fn()
    .mockResolvedValue([
      { id: 'label-1', name: 'Work', color: '#ff0000', createdAt: 1, updatedAt: 1 },
    ]);
  const audit = vi.fn();
  const writes = bindGatewayWrites(
    {} as PrismaClient,
    {
      getUserTimeContext: vi.fn(),
    } as unknown as UserTimeContextPort,
  );
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
    labels: { list, resolveNames },
    writes,
    audit,
  });
  return { gateway, list, resolveNames, audit, scopes };
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

describe('PAT scope → hosted label tools boundary (#993)', () => {
  it('allows label reads and explicitly rejects label writes on one labels:read PAT', async () => {
    const pats = createScopedPatService({
      database: patDatabase(),
      audience,
      accountIsActive: async () => true,
    });
    const issued = await pats.create('5b5d8a2b-9934-4be8-8e07-3f62ed122e15', {
      name: 'label reader',
      expiresInDays: 90,
      scopes: ['labels:read', 'tasks:write'],
    });
    expect(issued.scopes).toEqual(['labels:read', 'tasks:write']);
    const f = gatewayWith(
      {
        authenticate: (authorization, context) => pats.authenticate(authorization, context),
        consumeReadQuota: async () => true,
      },
      ['labels:read', 'tasks:write'],
    );

    const listed = await f.gateway.fetch(call(issued.secret, 'label_list'), requestContext);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      result: { structuredContent: { items: [{ id: 'label-1', name: 'Work' }] } },
    });

    const write = await f.gateway.fetch(
      call(issued.secret, 'task_plan_create', {
        idempotencyKey: 'label-write-1',
        plan: {
          name: 'Task with labels',
          importance: 'Moderate',
          labelIds: ['label-1'],
          schedule: { kind: 'OneTime', date: '2026-11-20', timing: { kind: 'AllDay' } },
        },
      }),
      requestContext,
    );
    expect(await write.json()).toMatchObject({
      result: { isError: true, content: [{ text: 'VALIDATION_ERROR' }] },
    });
    expect(f.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ effect: 'write', outcome: 'VALIDATION_ERROR' }),
    );
  });

  it('rejects label reads for a PAT issued without labels:read', async () => {
    const pats = createScopedPatService({
      database: patDatabase(),
      audience,
      accountIsActive: async () => true,
    });
    const issued = await pats.create('6c6e9b3c-aa45-4cf9-9f18-4a73fe233f26', {
      name: 'goal reader',
      expiresInDays: 90,
      scopes: ['goals:read'],
    });
    const f = gatewayWith(
      {
        authenticate: (authorization, context) => pats.authenticate(authorization, context),
        consumeReadQuota: async () => true,
      },
      ['goals:read'],
    );
    const response = await f.gateway.fetch(call(issued.secret, 'label_list'), requestContext);
    expect(response.status).toBe(403);
    expect(f.list).not.toHaveBeenCalled();
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({ scopeDecision: 'denied', outcome: 'INSUFFICIENT_SCOPE' }),
    );
  });

  it('accepts the ten-scope ceiling and rejects an eleventh scope at issuance', async () => {
    const pats = createScopedPatService({
      database: patDatabase(),
      audience,
      accountIsActive: async () => true,
    });
    const ten = [
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
    ];
    const issued = await pats.create('7d7fac4d-bb56-4d0a-af29-5b84ff344a37', {
      name: 'ten scope',
      expiresInDays: 90,
      scopes: ten,
    });
    expect(issued.scopes).toEqual(ten);
    await expect(
      pats.create('8e8ab15e-cc67-4e1b-b03a-6c9500555b48', {
        name: 'eleven scope',
        expiresInDays: 90,
        scopes: [...ten, 'goals:read'],
      }),
    ).rejects.toThrow();
  });
});
