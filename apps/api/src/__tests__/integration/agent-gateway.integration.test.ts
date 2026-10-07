import { createSettingPrismaTimeQuery } from '@memoflow/setting';
import { createTaskPrismaModule, createTaskPrismaReadQueries } from '@memoflow/task';
import { requireYmd } from '@memoflow/contracts/primitives';
import {
  TaskPlanSearchOutputSchema,
  TaskPlanGetOutputSchema,
  TaskOccurrenceListOutputSchema,
} from '@memoflow/contracts/agent-gateway';
import { bindTaskReadPort } from '../../modules/agent-gateway/task-read.port';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import express from 'express';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { prisma } from '@memoflow/database';
import { IdentityId } from '@memoflow/domain-shared';
import { createGoalPrismaModule, createGoalPrismaPageQuery } from '@memoflow/goal';
import { createAccountPrismaActiveQuery } from '@memoflow/account';
import { createScopedPatService } from '@memoflow/cloud-auth/server';
import { createTimeContext } from '@memoflow/time';
import {
  cleanAll,
  disconnectPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { composeAgentGatewayModule } from '../../modules/agent-gateway/module';
import { bindGoalReadPort } from '../../modules/agent-gateway/goal-read.port';
import { createRequestContextMiddleware } from '../../shared/infrastructure/http/middlewares/request-context.middleware';

const accountIsActive = createAccountPrismaActiveQuery(prisma);
const owner = () =>
  createGoalPrismaModule(prisma, {
    taskBindingReadPort: {
      checkActiveTaskBindings: async () => ({ hasActiveBindings: false, activeCount: 0 }),
    },
    userTimeContextPort: {
      getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
    },
    relationCleanupFactory: () => ({ unlinkAllForGoal: async () => 0 }),
  });
const cx = (identityId: string) => ({
  identityId,
  requestId: 'seed-request',
  traceId: 'seed-trace',
  startedAt: Date.now(),
  source: 'http' as const,
});
describe('PAT → hosted MCP → real Goal application → PostgreSQL', () => {
  beforeEach(cleanAll);
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });
  it('isolates two owners, pages deterministically and invalidates revoked credentials', async () => {
    const a = IdentityId.generate();
    const b = IdentityId.generate();
    await seedAccount({ id: a });
    await seedAccount({ id: b });
    const instance = owner();
    const ids: string[] = [];
    for (let index = 0; index < 3; index++) {
      const result = await instance.api.createGoal({ name: `Pilot A ${index}` }, cx(String(a)));
      if (!result.ok) throw new Error(result.error.message);
      ids.push(result.data.goalId);
    }
    const foreign = await instance.api.createGoal({ name: 'Private B' }, cx(String(b)));
    if (!foreign.ok) throw new Error(foreign.error.message);
    // Duplicate sort keys force the id tie-breaker to carry the second page.
    await prisma.goal.updateMany({
      where: { identityId: String(a) },
      data: { createdAt: new Date('2026-10-01T00:00:00Z') },
    });
    const app = express();
    app.use(createRequestContextMiddleware({ observer: { complete() {} } }));
    app.use(express.json({ limit: '256kb' }));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('address');
    const audience = `http://127.0.0.1:${address.port}/mcp`;
    const pats = createScopedPatService({ database: prisma, audience, accountIsActive });
    const pa = await pats.create(String(a), { name: 'A fixture' });
    const pb = await pats.create(String(b), { name: 'B fixture' });
    const audit: unknown[] = [];
    const module = composeAgentGatewayModule({
      admission: {
        start: async () => {},
        destroy: async () => {},
        consumeIp: async () => true,
        consumeOwner: async () => true,
      },
      enabled: true,
      audience,
      cursorSecret: 'test-only-secret-'.repeat(3),
      trustedOrigins: [],
      pats,
      goals: bindGoalReadPort(createGoalPrismaPageQuery(prisma)),
      audit: (event) => audit.push(event),
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
    const client = new Client(
      { name: 'postgres-fixture', version: '1' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    const other = new Client(
      { name: 'postgres-b-fixture', version: '1' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(audience), {
          requestInit: { headers: { authorization: `Bearer ${pa.secret}` } },
        }),
      );
      await other.connect(
        new StreamableHTTPClientTransport(new URL(audience), {
          requestInit: { headers: { authorization: `Bearer ${pb.secret}` } },
        }),
      );
      expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
        'goal_get',
        'goal_search',
      ]);
      const first = await client.callTool({
        name: 'goal_search',
        arguments: { query: 'Pilot', limit: 2 },
      });
      const page = first.structuredContent as {
        items: { id: string }[];
        nextCursor: string;
        hasMore: boolean;
      };
      expect(page.items).toHaveLength(2);
      expect(page.hasMore).toBe(true);
      const second = await client.callTool({
        name: 'goal_search',
        arguments: { query: 'Pilot', limit: 2, cursor: page.nextCursor },
      });
      const last = second.structuredContent as { items: { id: string }[]; hasMore: boolean };
      expect(last.items).toHaveLength(1);
      expect(last.hasMore).toBe(false);
      expect([...page.items, ...last.items].map((g) => g.id).sort()).toEqual(ids.sort());
      expect(
        await other.callTool({
          name: 'goal_search',
          arguments: { query: 'Pilot', limit: 2, cursor: page.nextCursor },
        }),
      ).toMatchObject({ isError: true, content: [{ text: 'INVALID_CURSOR' }] });
      expect(
        await client.callTool({ name: 'goal_get', arguments: { id: foreign.data.goalId } }),
      ).toMatchObject({ isError: true, content: [{ text: 'NOT_FOUND' }] });
      const webRead = await instance.api.getGoal(ids[0], String(a), true);
      if (!webRead.ok) throw new Error('Missing seeded Goal');
      expect(await client.callTool({ name: 'goal_get', arguments: { id: ids[0] } })).toMatchObject({
        structuredContent: {
          goal: { id: ids[0], name: webRead.data.name, version: webRead.data.version },
        },
      });
      expect(JSON.stringify(audit)).not.toContain(pa.secret);
      expect(JSON.stringify(audit)).not.toContain('Pilot');
      await pats.revoke(String(a), pa.id);
      await expect(client.callTool({ name: 'goal_search', arguments: {} })).rejects.toThrow();
    } finally {
      await client.close();
      await other.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await instance.dispose();
    }
  });
});

it('serves all six reads through the official SDK with separate Task scopes and owner parity', async () => {
  await cleanAll();
  const a = IdentityId.generate(),
    b = IdentityId.generate();
  await seedAccount({ id: a });
  await seedAccount({ id: b });
  const timePort = {
    getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
  };
  const tasks = createTaskPrismaModule(prisma, { userTimeContextPort: timePort });
  const plans = [];
  for (const identityId of [a, a, a, b]) {
    const created = await tasks.api.createTaskPlan({
      identityId,
      name: 'SDK Task fixture',
      importance: 'Moderate',
      schedule: { kind: 'OneTime', date: requireYmd('2026-11-01'), timing: { kind: 'AllDay' } },
    });
    if (!created.ok) throw new Error(created.error.message);
    plans.push(created.data.plan);
  }
  await prisma.taskPlan.updateMany({
    where: { identityId: String(a) },
    data: { createdAt: new Date('2026-10-01T00:00:00Z') },
  });
  const app = express();
  app.use(createRequestContextMiddleware({ observer: { complete() {} } }));
  app.use(express.json({ limit: '256kb' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('address');
  const audience = `http://127.0.0.1:${address.port}/mcp`;
  const pats = createScopedPatService({ database: prisma, audience, accountIsActive });
  const pa = await pats.create(String(a), {
    name: 'Six reads',
    scopes: ['goals:read', 'tasks:read'],
  });
  const pb = await pats.create(String(b), { name: 'Task only', scopes: ['tasks:read'] });
  const module = composeAgentGatewayModule({
    enabled: true,
    audience,
    cursorSecret: 'test-only-secret-'.repeat(3),
    trustedOrigins: [],
    pats,
    goals: bindGoalReadPort(createGoalPrismaPageQuery(prisma)),
    tasks: bindTaskReadPort(createTaskPrismaReadQueries(prisma, timePort)),
    audit() {},
    admission: {
      start: async () => {},
      destroy: async () => {},
      consumeIp: async () => true,
      consumeOwner: async () => true,
    },
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
  const client = new Client(
    { name: 'six-read-fixture', version: '1' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  const legacy = new Client({ name: 'legacy-read-fixture', version: '1' });
  const other = new Client(
    { name: 'task-only-fixture', version: '1' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  try {
    for (const [c, pat] of [
      [client, pa],
      [other, pb],
    ] as const)
      await c.connect(
        new StreamableHTTPClientTransport(new URL(audience), {
          requestInit: { headers: { authorization: `Bearer ${pat.secret}` } },
        }),
      );
    await legacy.connect(
      new StreamableHTTPClientTransport(new URL(audience), {
        requestInit: { headers: { authorization: `Bearer ${pa.secret}` } },
      }),
    );
    expect((await legacy.listTools()).tools).toHaveLength(6);
    expect(
      await legacy.callTool({ name: 'task_plan_search', arguments: { limit: 1 } }),
    ).toMatchObject({ structuredContent: { hasMore: true } });
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
      'goal_get',
      'goal_search',
      'task_plan_get',
      'task_plan_search',
      'task_occurrence_get',
      'task_occurrence_list',
    ]);
    expect((await other.listTools()).tools.map((t) => t.name)).toEqual([
      'task_plan_get',
      'task_plan_search',
      'task_occurrence_get',
      'task_occurrence_list',
    ]);
    const first = await client.callTool({
      name: 'task_plan_search',
      arguments: { limit: 2, query: 'SDK' },
    });
    const page = TaskPlanSearchOutputSchema.parse(first.structuredContent);
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    const second = TaskPlanSearchOutputSchema.parse(
      (
        await client.callTool({
          name: 'task_plan_search',
          arguments: { limit: 2, query: 'SDK', cursor: page.nextCursor },
        })
      ).structuredContent,
    );
    expect(second.items).toHaveLength(1);
    expect(new Set([...page.items, ...second.items].map((p) => p.id)).size).toBe(3);
    expect(
      await other.callTool({
        name: 'task_plan_search',
        arguments: { limit: 2, query: 'SDK', cursor: page.nextCursor },
      }),
    ).toMatchObject({ isError: true, content: [{ text: 'INVALID_CURSOR' }] });
    expect(
      await client.callTool({ name: 'task_plan_get', arguments: { id: plans[3].id } }),
    ).toMatchObject({ isError: true, content: [{ text: 'NOT_FOUND' }] });
    const web = await tasks.api.getTaskPlan(plans[0].id, String(a));
    if (!web.ok || !web.data) throw Error('read');
    const own = TaskPlanGetOutputSchema.parse(
      (await client.callTool({ name: 'task_plan_get', arguments: { id: plans[0].id } }))
        .structuredContent,
    );
    expect(own.plan).toMatchObject({
      id: plans[0].id,
      name: web.data.name,
      schedule: web.data.schedule,
      version: web.data.version,
    });
    expect(own.plan).not.toHaveProperty('occurrenceCount');
    expect(own.plan).not.toHaveProperty('identityId');
    const count = await prisma.taskOccurrence.count();
    const range = {
      startDate: Date.parse('2026-11-01T00:00:00Z'),
      endDate: Date.parse('2026-11-01T23:59:59Z'),
      limit: 2,
    };
    const occurrences = TaskOccurrenceListOutputSchema.parse(
      (await client.callTool({ name: 'task_occurrence_list', arguments: range })).structuredContent,
    );
    expect(occurrences.items).toHaveLength(2);
    expect(occurrences.hasMore).toBe(true);
    const last = TaskOccurrenceListOutputSchema.parse(
      (
        await client.callTool({
          name: 'task_occurrence_list',
          arguments: { ...range, cursor: occurrences.nextCursor },
        })
      ).structuredContent,
    );
    expect(last.items).toHaveLength(1);
    expect(last.asOf).toBe(occurrences.asOf);
    const occurrence = occurrences.items[0];
    const webOccurrence = await tasks.api.getTaskOccurrence(occurrence.id, String(a));
    if (!webOccurrence.ok || !webOccurrence.data) throw Error('occurrence');
    expect(
      await client.callTool({ name: 'task_occurrence_get', arguments: { id: occurrence.id } }),
    ).toMatchObject({
      structuredContent: {
        occurrence: {
          id: occurrence.id,
          planId: occurrence.planId,
          version: webOccurrence.data.version,
          dueAt: webOccurrence.data.dueAt,
        },
      },
    });
    const foreignOccurrence = await prisma.taskOccurrence.findFirstOrThrow({
      where: { identityId: String(b) },
    });
    expect(
      await client.callTool({
        name: 'task_occurrence_get',
        arguments: { id: foreignOccurrence.id },
      }),
    ).toMatchObject({ isError: true, content: [{ text: 'NOT_FOUND' }] });
    expect(await prisma.taskOccurrence.count()).toBe(count);
    await prisma.externalAgentPat.update({
      where: { id: pa.id },
      data: { scopes: ['goals:read'] },
    });
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
      'goal_get',
      'goal_search',
    ]);
    await expect(
      client.callTool({ name: 'task_plan_get', arguments: { id: plans[0].id } }),
    ).rejects.toThrow();
  } finally {
    await legacy.close();
    await client.close();
    await other.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await tasks.dispose();
    await cleanAll();
  }
});


it('cancels a blocked Setting time read within the Task owner deadline', async () => {
  let unlock!: () => void, locked!: () => void;
  const ready = new Promise<void>((resolve) => { locked = resolve; });
  const release = new Promise<void>((resolve) => { unlock = resolve; });
  const holder = prisma.$transaction(async (tx) => {
    await tx.$executeRaw`LOCK TABLE user_preference_records IN ACCESS EXCLUSIVE MODE`;
    locked();
    await release;
  }, { timeout: 5000 });
  await ready;
  try {
    const queries = createTaskPrismaReadQueries(prisma, createSettingPrismaTimeQuery(prisma));
    expect(await queries.searchTaskPlans('deadline-owner', { limit: 1 }, {
      deadlineAt: Date.now() + 150, signal: new AbortController().signal,
    })).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    const [active] = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state='active' AND wait_event_type='Lock' AND query LIKE '%user_preference_records%'`;
    expect(Number(active.count)).toBe(0);
  } finally { unlock(); await holder; }
});
