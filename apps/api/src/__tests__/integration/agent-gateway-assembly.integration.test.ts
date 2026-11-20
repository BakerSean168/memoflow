import { afterAll, beforeEach, expect, it } from 'vitest';
import { once } from 'node:events';
import express from 'express';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { prisma } from '@memoflow/database';
import { IdentityId } from '@memoflow/utils/domain';
import { createAccountPrismaActiveQuery } from '@memoflow/account';
import { createScopedPatService } from '@memoflow/cloud-auth/server';
import { createGoalPrismaPageQuery } from '@memoflow/goal';
import { createTaskPrismaReadQueries } from '@memoflow/task';
import { createSettingPrismaTimeQuery } from '@memoflow/setting';
import { createTimeContext } from '@memoflow/time';
import {
  cleanAll,
  disconnectPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { composeAgentGatewayModule } from '../../modules/agent-gateway/module';
import { bindGoalReadPort } from '../../modules/agent-gateway/goal-read.port';
import { bindTaskReadPort } from '../../modules/agent-gateway/task-read.port';
import { bindGatewayWrites } from '../../modules/agent-gateway/write.port';
import { createGatewayPermissionCheckpoint } from '@memoflow/ai/agent-gateway';
import { PermissionPrismaRepository } from '@memoflow/ai/agent-gateway';
import { createRequestContextMiddleware } from '../../shared/infrastructure/http/middlewares/request-context.middleware';

const time = {
  getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
};
const scopes = ['goals:read', 'tasks:read', 'goals:write', 'tasks:write', 'routines:write'];

async function fixture() {
  const identity = String(IdentityId.generate());
  await seedAccount({ id: identity });
  const app = express();
  app.use(createRequestContextMiddleware({ observer: { complete() {} } }));
  app.use(express.json({ limit: '256kb' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('address');
  const audience = `http://127.0.0.1:${address.port}/mcp`;
  const pats = createScopedPatService({
    database: prisma,
    audience,
    accountIsActive: createAccountPrismaActiveQuery(prisma),
  });
  const writePat = await pats.create(identity, { name: 'Assembly writes', scopes });
  const readPat = await pats.create(identity, { name: 'Assembly reads', scopes: ['goals:read'] });
  const audit: unknown[] = [];
  const module = composeAgentGatewayModule({
    admission: {
      start: async () => {},
      destroy: async () => {},
      consumeIp: async () => true,
      consumeOwner: async () => true,
    },
    enabled: true,
    // The real business-policy checkpoint, not a pass-through stub.
    toolCheckpoint: createGatewayPermissionCheckpoint(new PermissionPrismaRepository(prisma)),
    writes: bindGatewayWrites(prisma, time, { routineWriteEnabled: true }),
    audience,
    cursorSecret: 'test-only-secret-'.repeat(3),
    trustedOrigins: [],
    pats,
    goals: bindGoalReadPort(createGoalPrismaPageQuery(prisma)),
    tasks: bindTaskReadPort(
      createTaskPrismaReadQueries(prisma, createSettingPrismaTimeQuery(prisma)),
    ),
    audit: (event) => audit.push(event),
    auditQuery: { list: async () => ({ items: [], hasMore: false }) },
  });
  await module.register({
    app,
    router: express.Router(),
    middleware: {
      auth: (_req, res) => res.sendStatus(401),
      requireEmailVerified: (_req, res) => res.sendStatus(403),
      requireRole: () => (_req, res) => res.sendStatus(403),
    },
  } as never);
  const connect = async (secret: string) => {
    const client = new Client(
      { name: 'assembly-fixture', version: '1' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(audience), {
        requestInit: { headers: { authorization: `Bearer ${secret}` } },
      }),
    );
    return client;
  };
  const close = () => module.destroy?.();
  return { identity, server, writePat, readPat, audit, connect, close };
}

beforeEach(cleanAll);
afterAll(async () => {
  await cleanAll();
  await disconnectPrisma();
});

it('serves goal/task reads, writes and routine_create through the real compose for a scoped PAT', async () => {
  const f = await fixture();
  const client = await f.connect(f.writePat.secret);
  const reader = await f.connect(f.readPat.secret);
  try {
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    expect(tools).toEqual(
      expect.arrayContaining([
        'goal_get',
        'goal_search',
        'task_plan_get',
        'task_plan_search',
        'goal_create',
        'task_plan_create',
        'routine_create',
      ]),
    );
    expect((await reader.listTools()).tools.map((tool) => tool.name)).toEqual([
      'goal_get',
      'goal_search',
    ]);

    const goal = await client.callTool({
      name: 'goal_create',
      arguments: { idempotencyKey: 'assembly-goal', goal: { name: 'Assembly Goal' } },
    });
    const goalId = (goal.structuredContent as { result: { goalId: string } }).result.goalId;
    expect(goalId).toBeTruthy();
    expect(await client.callTool({ name: 'goal_get', arguments: { id: goalId } })).toMatchObject({
      structuredContent: { goal: { id: goalId } },
    });
    expect(await reader.callTool({ name: 'goal_search', arguments: {} })).toMatchObject({
      structuredContent: { items: [{ id: goalId }] },
    });

    // A read-only PAT cannot mint a write even though the tool exists for others.
    await expect(
      reader.callTool({
        name: 'goal_create',
        arguments: { idempotencyKey: 'assembly-denied', goal: { name: 'Denied' } },
      }),
    ).rejects.toThrow();

    const taskDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const task = await client.callTool({
      name: 'task_plan_create',
      arguments: {
        idempotencyKey: 'assembly-task',
        plan: {
          name: 'Assembly Task',
          schedule: { kind: 'OneTime', date: taskDate, timing: { kind: 'AllDay' } },
          importance: 'Moderate',
          labelIds: [],
        },
      },
    });
    const taskId = (task.structuredContent as { result: { plan: { id: string } } }).result.plan.id;
    expect(taskId).toBeTruthy();
    expect(
      await client.callTool({ name: 'task_plan_get', arguments: { id: taskId } }),
    ).toMatchObject({ structuredContent: { plan: { id: taskId } } });

    const startDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const routine = await client.callTool({
      name: 'routine_create',
      arguments: {
        idempotencyKey: 'assembly-routine',
        name: 'Assembly reminder',
        trigger: {
          type: 'WallClock',
          localTime: '09:00',
          timeZone: 'Asia/Shanghai',
          startDate,
        },
      },
    });
    expect(routine).not.toMatchObject({ isError: true });
    expect(
      (routine.structuredContent as { result: { routine: { id: string } } }).result.routine.id,
    ).toBeTruthy();

    // Every allow/deny is audited with the credential that made the call.
    expect(f.audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: 'goal_create',
          credentialId: f.writePat.id,
          scopeDecision: 'allowed',
          outcome: 'OK',
        }),
        expect.objectContaining({
          tool: 'routine_create',
          credentialId: f.writePat.id,
          scopeDecision: 'allowed',
          outcome: 'OK',
        }),
      ]),
    );
    expect(await prisma.goal.count({ where: { identityId: f.identity } })).toBe(1);
    expect(await prisma.taskPlan.count({ where: { identityId: f.identity } })).toBe(1);
    expect(await prisma.routineDefinition.count({ where: { identityId: f.identity } })).toBe(1);
  } finally {
    await client.close();
    await reader.close();
    f.server.closeAllConnections();
    await new Promise<void>((resolve) => f.server.close(() => resolve()));
    await f.close();
  }
});
