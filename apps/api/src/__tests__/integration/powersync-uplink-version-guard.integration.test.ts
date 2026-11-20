import type { GatewayToolCheckpoint } from '@memoflow/agent-gateway';
import { createReadGateway } from '@memoflow/agent-gateway/server';
import { createAccountPrismaActiveQuery } from '@memoflow/account';
import { createScopedPatService } from '@memoflow/cloud-auth/server';
import { prisma } from '@memoflow/database';
import { createTimeContext } from '@memoflow/time';
import { IdentityId } from '@memoflow/utils/domain';
import type { Express } from 'express';
import express, { Router } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, expect, it } from 'vitest';
import {
  cleanAll,
  disconnectPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import type { DatabaseClient } from '../../shared/contracts/api-module';
import { composePowerSyncApiModule } from '../../modules/powersync/module';
import { bindGatewayWrites } from '../../modules/agent-gateway/write.port';

/**
 * Cross-boundary proof for ADR-125: a cloud MCP write and a desktop PowerSync
 * uplink racing on the same `goals` / `task_plans` row. Both legs use the real
 * server entry points and the real PostgreSQL database.
 */
const audience = 'http://127.0.0.1/mcp';
const time = {
  getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
};
const cx = (identityId: string) => ({
  identityId,
  source: 'http' as const,
  requestId: 'uat',
  traceId: 'uat',
  startedAt: Date.now(),
});

function mcpRequest(secret: string, method: string, name: string, args: unknown): Request {
  return new Request(audience, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': method,
      'Mcp-Name': name,
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: {
        name,
        arguments: args,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'sync-guard', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
}

async function createFixture() {
  const identityId = String(IdentityId.generate());
  await seedAccount({ id: identityId });
  const pats = createScopedPatService({
    database: prisma,
    audience,
    accountIsActive: createAccountPrismaActiveQuery(prisma),
  });
  const pat = await pats.create(identityId, {
    name: 'sync guard',
    scopes: ['goals:write', 'tasks:write', 'goals:read'],
  });
  const gateway = createReadGateway({
    enabled: true,
    toolCheckpoint: (async (_principal, _tool, work) => work()) satisfies GatewayToolCheckpoint,
    audience,
    trustedOrigins: [],
    cursorSecret: 'test-only-secret-'.repeat(3),
    credentials: { authenticate: pats.authenticate, consumeReadQuota: pats.consumeReadQuota },
    consumeOwnerQuota: async () => true,
    audit: () => {},
    goals: {
      getGoal: async () => null,
      searchGoalPage: async () => ({ items: [], hasMore: false, next: null }),
    },
    writes: bindGatewayWrites(prisma, time),
  });
  const call = async (name: string, args: unknown) => {
    const response = await gateway.fetch(
      mcpRequest(pat.secret, 'tools/call', name, args),
      cx(identityId),
    );
    const payload: unknown = await response.json();
    return payload as {
      result?: { structuredContent?: unknown; isError?: boolean; content?: { text: string }[] };
    };
  };
  return { identityId, call };
}

function createUplinkApp(identityId: string): Express {
  const app = express();
  app.use(express.json());
  const router = Router();
  app.use('/api/v1', router);
  composePowerSyncApiModule({ db: prisma as unknown as DatabaseClient }).register({
    app,
    router,
    middleware: {
      auth: (req, _res, next) => {
        (req as typeof req & { user?: { identityId: string } }).user = { identityId };
        next();
      },
      requireRole: () => (_req, _res, next) => next(),
    },
  });
  return app;
}

function upload(app: Express, ops: unknown[]) {
  return request(app)
    .put('/api/v1/powersync/crud')
    .send({ transactions: [{ ops }] });
}

beforeEach(cleanAll);
afterAll(disconnectPrisma);

it('rejects the stale local goal upload and keeps the winning cloud MCP write', async () => {
  const { identityId, call } = await createFixture();
  const created = await call('goal_create', {
    idempotencyKey: 'goal-create',
    goal: { name: 'Shared goal' },
  });
  const goal = await prisma.goal.findFirstOrThrow({ where: { identityId } });
  const app = createUplinkApp(identityId);

  // Desktop was offline at the created revision (v1) and edited the same row.
  const localOps = [
    {
      op: 'PATCH',
      type: 'goals',
      id: goal.id,
      data: { name: 'Local offline edit', version: goal.version + 1 },
    },
  ];
  expect(created.result?.isError).toBeUndefined();

  // Cloud MCP wins the race first.
  const cloud = await call('goal_update', {
    idempotencyKey: 'goal-update',
    goalId: goal.id,
    changes: { expectedVersion: goal.version, name: 'Cloud edit' },
  });
  expect(cloud.result?.isError).toBeUndefined();

  const rejected = await upload(app, localOps);
  expect(rejected.status).toBe(409);
  expect(rejected.body).toMatchObject({
    ok: false,
    error: {
      code: 'CONFLICT',
      context: {
        code: 'row_version_conflict',
        reason: 'stale_version',
        identityId,
        table: 'goals',
        rowId: goal.id,
        operation: 'PATCH',
        incomingVersion: goal.version + 1,
        currentVersion: goal.version + 1,
      },
    },
  });

  const stored = await prisma.goal.findFirstOrThrow({ where: { id: goal.id } });
  expect(stored.name).toBe('Cloud edit');
  expect(stored.version).toBe(goal.version + 1);
});

it('applies a local upload that is current and rolls back mixed batches atomically', async () => {
  const { identityId, call } = await createFixture();
  await call('goal_create', { idempotencyKey: 'g1', goal: { name: 'Shared goal' } });
  const goal = await prisma.goal.findFirstOrThrow({ where: { identityId } });
  const app = createUplinkApp(identityId);

  const accepted = await upload(app, [
    {
      op: 'PATCH',
      type: 'goals',
      id: goal.id,
      data: { name: 'Local wins', version: goal.version + 1 },
    },
  ]);
  expect(accepted.status).toBe(200);

  // The cloud write now loses: its expectedVersion is stale.
  const cloud = await call('goal_update', {
    idempotencyKey: 'g1-update',
    goalId: goal.id,
    changes: { expectedVersion: goal.version, name: 'Cloud edit' },
  });
  expect(cloud.result).toMatchObject({ isError: true });

  const current = await prisma.goal.findFirstOrThrow({ where: { id: goal.id } });
  expect(current).toMatchObject({ name: 'Local wins', version: goal.version + 1 });

  // A batch whose stale goal op fails must not apply its valid sibling op.
  const sibling = await prisma.goal.create({
    data: { id: String(IdentityId.generate()), identityId, name: 'Sibling goal', version: 1 },
  });
  const mixed = await upload(app, [
    {
      op: 'PATCH',
      type: 'goals',
      id: goal.id,
      data: { name: 'Stale again', version: current.version },
    },
    {
      op: 'PATCH',
      type: 'goals',
      id: sibling.id,
      data: { name: 'Sibling local edit', version: 2 },
    },
  ]);
  expect(mixed.status).toBe(409);
  expect((await prisma.goal.findFirstOrThrow({ where: { id: goal.id } })).name).toBe('Local wins');
  expect((await prisma.goal.findFirstOrThrow({ where: { id: sibling.id } })).name).toBe(
    'Sibling goal',
  );
});

it('guards task plan uplink with the same version contract', async () => {
  const { identityId, call } = await createFixture();
  const created = await call('task_plan_create', {
    idempotencyKey: 'plan-create',
    plan: {
      name: 'Shared plan',
      importance: 'Moderate',
      schedule: {
        kind: 'OneTime',
        date: new Date().toISOString().slice(0, 10),
        timing: { kind: 'AllDay' },
      },
    },
  });
  expect(created.result?.isError).toBeUndefined();
  const plan = await prisma.taskPlan.findFirstOrThrow({ where: { identityId } });
  const app = createUplinkApp(identityId);

  const cloud = await call('task_plan_update', {
    idempotencyKey: 'plan-update',
    planId: plan.id,
    changes: { expectedVersion: plan.version, name: 'Cloud plan' },
  });
  expect(cloud.result?.isError).toBeUndefined();

  const rejected = await upload(app, [
    {
      op: 'PATCH',
      type: 'task_plans',
      id: plan.id,
      data: { name: 'Stale local plan', version: plan.version + 1 },
    },
  ]);
  expect(rejected.status).toBe(409);
  expect(rejected.body.error.context).toMatchObject({
    code: 'row_version_conflict',
    table: 'task_plans',
    rowId: plan.id,
    reason: 'stale_version',
  });
  const stored = await prisma.taskPlan.findFirstOrThrow({ where: { id: plan.id } });
  expect(stored).toMatchObject({ name: 'Cloud plan', version: plan.version + 1 });
});
