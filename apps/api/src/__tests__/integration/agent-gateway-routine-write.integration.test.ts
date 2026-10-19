import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { prisma, type Prisma } from '@memoflow/database';
import { createGoalPrismaAgentMutations } from '@memoflow/goal';
import { IdentityId } from '@memoflow/domain-shared';
import { RoutineAgentCreateSchema } from '@memoflow/contracts/routine';
import { RoutineDefinition, createRoutinePrismaAgentMutations } from '@memoflow/reminder';
import { createReadGateway } from '@memoflow/agent-gateway/server';
import { createScopedPatService, isScopedPatAuthorityCurrent } from '@memoflow/cloud-auth/server';
import { createAccountPrismaActiveQuery } from '@memoflow/account';
import { createTimeContext } from '@memoflow/time';
import {
  cleanAll,
  disconnectPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { createRoutinePrismaScheduleProjectionSource } from '@memoflow/reminder/schedule-projection/routine';
import {
  createRoutinePrismaScheduleExecutionDeps,
  createRoutineScheduleExecutionSource,
  parseRoutineWallClockPayload,
} from '@memoflow/reminder/schedule-execution/routine';
import {
  createSchedulerPrismaRepositories,
  createScheduledInvocationSchedulingPort,
} from '@memoflow/scheduler';
import { bindGatewayWrites } from '../../modules/agent-gateway/write.port';
import { composeRoutine } from '../../runtime/compose-routine';
import { RoutineAICommandAdapter } from '../../modules/ai/routine-command.adapter';
const audience = 'https://eag539.test/mcp';
const cx = (identityId: string) => ({
  identityId,
  source: 'http' as const,
  requestId: '539',
  traceId: '539',
  startedAt: Date.now(),
});
const time = {
  getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
};
const at = Date.parse('2026-10-19T00:00:00Z');
const due = Date.parse('2026-10-20T01:00:00Z');
const input = RoutineAgentCreateSchema.parse({
  idempotencyKey: 'once',
  name: 'Review Q4 goals',
  description: 'Private reminder',
  trigger: {
    type: 'WallClock' as const,
    localTime: '09:00',
    timeZone: 'Asia/Shanghai',
    startDate: '2026-10-20',
  },
});
const authority = { connectionId: 'credential-a', authorize: async () => {} };
beforeEach(cleanAll);
afterAll(async () => {
  await cleanAll();
  await disconnectPrisma();
});
async function identity() {
  const id = String(IdentityId.generate());
  await seedAccount({ id });
  return id;
}
function request(secret: string, method: string, args: unknown = {}, name = 'routine_create') {
  return new Request(audience, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': method,
      ...(method === 'tools/call' ? { 'Mcp-Name': name } : {}),
      authorization: 'Bearer ' + secret,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: {
        ...(method === 'tools/call' ? { name, arguments: args } : {}),
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: '539', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
}
async function fixture() {
  const a = await identity(),
    b = await identity();
  const pats = createScopedPatService({
    database: prisma,
    audience,
    accountIsActive: createAccountPrismaActiveQuery(prisma),
  });
  const pa = await pats.create(a, { name: 'Routine A', scopes: ['routines:write'] }),
    pb = await pats.create(b, { name: 'Routine B', scopes: ['routines:write'] });
  const audit: unknown[] = [];
  const options = {
    enabled: true,
    audience,
    trustedOrigins: [],
    cursorSecret: 'test-only-secret-'.repeat(3),
    credentials: { authenticate: pats.authenticate, consumeReadQuota: pats.consumeReadQuota },
    consumeOwnerQuota: async () => true,
    audit: (event: unknown) => {
      audit.push(event);
    },
    goals: {
      getGoal: async () => null,
      searchGoalPage: async () => ({ items: [], hasMore: false, next: null }),
    },
  };
  const gateway = () =>
    createReadGateway({
      ...options,
      writes: bindGatewayWrites(prisma, time, { routineWriteEnabled: true }),
    });
  return { a, b, pats, pa, pb, audit, options, gateway };
}
it('commits concurrent duplicates once, persists exact snapshots across reconnect and isolates credentials and identities', async () => {
  const a = await identity(),
    b = await identity();
  const owner = () => createRoutinePrismaAgentMutations(prisma, { now: () => at });
  const [first, second] = await Promise.all([
    owner().create(input, cx(a), authority),
    owner().create(input, cx(a), authority),
  ]);
  expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
  expect(first.result).toEqual(second.result);
  expect(first.result.scheduledFor).toBe(due);
  const row = await prisma.routineDefinition.findUniqueOrThrow({
    where: { id: first.result.routine.id },
  });
  expect(JSON.parse(row.triggerJson!)).toEqual({
    type: 'WallClock',
    timingOwner: 'scheduler',
    localTime: '09:00',
    timeZone: 'Asia/Shanghai',
    recurrence: {
      startDate: '2026-10-20',
      frequency: 'daily',
      interval: 1,
      byWeekday: [],
      count: 1,
      until: null,
    },
  });
  expect(row).toMatchObject({ identityId: a, version: 1, name: input.name });
  expect(await prisma.routineProfileMembership.count()).toBe(0);
  const saved = await prisma.externalMutationReceipt.findUniqueOrThrow({
    where: { id: first.receiptId },
  });
  expect(JSON.parse(saved.resultJson)).toEqual({
    receiptId: first.receiptId,
    result: first.result,
  });
  await prisma.routineDefinition.update({
    where: { id: row.id },
    data: { name: 'Changed later', version: 2 },
  });
  await prisma.$disconnect();
  // Replay after the occurrence is past must use the original snapshot, not revalidate its time.
  expect(
    await createRoutinePrismaAgentMutations(prisma, { now: () => due + 86400000 }).create(
      input,
      cx(a),
      authority,
    ),
  ).toEqual({ ...first, replayed: true });
  for (const patch of [
    { name: 'Different' },
    { description: 'Changed' },
    { trigger: { ...input.trigger, localTime: '10:00' } },
  ])
    await expect(owner().create({ ...input, ...patch }, cx(a), authority)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  const foreign = await owner().create(input, cx(b), authority);
  expect(foreign.receiptId).not.toBe(first.receiptId);
  expect(foreign.result.routine.id).not.toBe(row.id);
  const otherCredential = await owner().create(input, cx(a), {
    ...authority,
    connectionId: 'credential-b',
  });
  expect(otherCredential.receiptId).not.toBe(first.receiptId);
  expect(await prisma.routineDefinition.count({ where: { identityId: a } })).toBe(2);
});
it('rejects exhausted or distant one-shots and rolls back facts when receipt persistence fails', async () => {
  const a = await identity();
  const owner = createRoutinePrismaAgentMutations(prisma, { now: () => at });
  for (const startDate of ['2026-10-18', '2028-01-01'])
    await expect(
      owner.create({ ...input, trigger: { ...input.trigger, startDate } }, cx(a), authority),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(await prisma.routineDefinition.count()).toBe(0);
  expect(await prisma.externalMutationReceipt.count()).toBe(0);
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION eag539_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt fault'; END $$`,
  );
  await prisma.$executeRawUnsafe(
    'CREATE TRIGGER eag539_receipt_fault BEFORE INSERT ON external_mutation_receipts FOR EACH ROW EXECUTE FUNCTION eag539_reject_receipt()',
  );
  let notified = 0;
  try {
    await expect(
      createRoutinePrismaAgentMutations(prisma, {
        now: () => at,
        onScheduleChanged: () => {
          notified++;
        },
      }).create(input, cx(a), authority),
    ).rejects.toThrow();
    expect(await prisma.routineDefinition.count()).toBe(0);
    expect(await prisma.externalMutationReceipt.count()).toBe(0);
    expect(notified).toBe(0);
    expect(await prisma.scheduledInvocation.count()).toBe(0);
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER eag539_receipt_fault ON external_mutation_receipts',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION eag539_reject_receipt()');
  }
});
it('authenticates real MCP PAT writes, gates discovery, rejects private claims and audits replay/conflict/denial', async () => {
  const f = await fixture();
  // Relative future date keeps real HTTP validation independent of wall-clock test execution.
  const future = {
    ...input,
    trigger: {
      ...input.trigger,
      startDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    },
  };
  const send = (secret: string, method: string, args: unknown = {}) =>
    f.gateway().fetch(request(secret, method, args), cx(f.a));
  const listed = await (await send(f.pa.secret, 'tools/list')).json();
  expect(listed.result.tools.map((t: { name: string }) => t.name)).toEqual(['routine_create']);
  const off = createReadGateway({ ...f.options, writes: bindGatewayWrites(prisma, time) });
  expect(
    (await (await off.fetch(request(f.pa.secret, 'tools/list'), cx(f.a))).json()).result.tools,
  ).toEqual([]);
  expect((await off.fetch(request(f.pa.secret, 'tools/call', future), cx(f.a))).status).toBe(404);
  const first = await (await send(f.pa.secret, 'tools/call', future)).json();
  expect(first.result, JSON.stringify(first)).toHaveProperty('structuredContent');
  const receipt = first.result.structuredContent;
  expect(receipt.replayed).toBe(false);
  // The production repair seam converges a committed HTTP write even if its event was lost.
  const source = createRoutinePrismaScheduleProjectionSource(prisma);
  const plan = await source.buildRoutinePlan(receipt.result.routine.id, f.a);
  expect(plan.desired).toHaveLength(1);
  expect(plan.desired[0]).toMatchObject({ runAt: receipt.result.scheduledFor, sourceRevision: 1 });
  const scheduling = createScheduledInvocationSchedulingPort(
    createSchedulerPrismaRepositories(prisma).scheduledInvocationRepository,
  );
  await scheduling.reconcile(plan.owner, plan.desired);
  await prisma.$disconnect();
  expect(
    (await (await send(f.pa.secret, 'tools/call', future)).json()).result.structuredContent,
  ).toEqual({ ...receipt, replayed: true });
  expect(
    (await (await send(f.pa.secret, 'tools/call', { ...future, name: 'Different' })).json()).result,
  ).toMatchObject({ isError: true, content: [{ text: 'IDEMPOTENCY_CONFLICT' }] });
  expect(
    (await (await send(f.pb.secret, 'tools/call', future)).json()).result.structuredContent
      .receiptId,
  ).not.toBe(receipt.receiptId);
  const invalid = await (
    await send(f.pa.secret, 'tools/call', { ...future, identityId: f.b, profileIds: ['foreign'] })
  ).json();
  expect(invalid.result?.isError ?? Boolean(invalid.error)).toBe(true);
  expect(await prisma.routineDefinition.count({ where: { identityId: f.a } })).toBe(1);
  expect(await prisma.routineProfileMembership.count()).toBe(0);
  expect(
    await prisma.scheduledInvocation.count({
      where: { identityId: f.a, ownerId: receipt.result.routine.id },
    }),
  ).toBe(1);
  expect(f.audit).toContainEqual(
    expect.objectContaining({
      tool: 'routine_create',
      effect: 'write',
      receiptId: receipt.receiptId,
      replayed: true,
      scopeDecision: 'allowed',
      outcome: 'OK',
    }),
  );
  expect(f.audit).toContainEqual(
    expect.objectContaining({ tool: 'routine_create', outcome: 'IDEMPOTENCY_CONFLICT' }),
  );
  expect(f.audit).toContainEqual(
    expect.objectContaining({
      tool: 'routine_create',
      outcome: 'DISABLED',
      scopeDecision: 'denied',
    }),
  );
  expect(JSON.stringify(f.audit)).not.toMatch(/Review Q4|Private reminder|Asia\/Shanghai/);
  expect(JSON.stringify(f.audit)).not.toContain(f.pa.secret);
  await f.pats.revoke(f.a, f.pa.id);
  expect((await send(f.pa.secret, 'tools/call', future)).status).toBe(401);
});
it('rechecks durable current authority inside the receipt transaction before first execution and replay', async () => {
  const f = await fixture();
  const future = {
    ...input,
    trigger: {
      ...input.trigger,
      startDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    },
  };
  const writes = bindGatewayWrites(prisma, time, { routineWriteEnabled: true });
  if (!writes.routineCreate) throw new Error('Routine write unavailable');
  const auth = {
    connectionId: f.pa.id,
    scopes: ['routines:write'],
    authorize: async () => {
      await f.pats.revoke(f.a, f.pa.id);
    },
  };
  await expect(writes.routineCreate(future, cx(f.a), auth)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(await prisma.routineDefinition.count()).toBe(0);
  expect(await prisma.externalMutationReceipt.count()).toBe(0);
  await prisma.externalAgentPat.update({ where: { id: f.pa.id }, data: { revokedAt: null } });
  const accepted = await writes.routineCreate(future, cx(f.a), {
    ...auth,
    authorize: async () => {},
  });
  expect(accepted.replayed).toBe(false);
  await expect(
    writes.routineCreate(future, cx(f.a), {
      ...auth,
      authorize: async () => {
        await prisma.externalAgentPat.update({
          where: { id: f.pa.id },
          data: { scopes: ['tasks:read'] },
        });
      },
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await prisma.routineDefinition.count()).toBe(1);
  expect(await prisma.externalMutationReceipt.count()).toBe(1);
});

async function projectAndExecute(identityId: string, routineId: string, repairAt = at) {
  const source = createRoutinePrismaScheduleProjectionSource(prisma, { now: () => repairAt });
  const scheduler = createScheduledInvocationSchedulingPort(
    createSchedulerPrismaRepositories(prisma).scheduledInvocationRepository,
    { now: () => repairAt },
  );
  const refs = await source.listRoutineRefs();
  expect(refs).toContainEqual({ identityId, routineId });
  const plan = await source.buildRoutinePlan(routineId, identityId);
  expect(plan.desired).toHaveLength(1);
  expect(plan.desired[0]).toMatchObject({ runAt: due, sourceRevision: 1 });
  await scheduler.reconcile(plan.owner, plan.desired);
  await scheduler.reconcile(plan.owner, plan.desired);
  expect(
    await prisma.scheduledInvocation.count({ where: { identityId, ownerId: routineId } }),
  ).toBe(1);
  await prisma.$disconnect();
  const restarted = createRoutineScheduleExecutionSource(
    createRoutinePrismaScheduleExecutionDeps(prisma, { now: () => Math.max(repairAt, due) }),
  );
  const payload = parseRoutineWallClockPayload(plan.desired[0]!.payload);
  expect(await restarted.executeRoutineOccurrence(payload)).toMatchObject({
    kind: 'succeeded',
    nextOccurrenceAt: null,
    notificationRequested: true,
  });
  expect(await restarted.executeRoutineOccurrence(payload)).toMatchObject({
    kind: 'succeeded',
    nextOccurrenceAt: null,
    notificationRequested: true,
  });
  expect(await prisma.routineOccurrence.count({ where: { identityId, routineId } })).toBe(1);
  const after = await createRoutinePrismaScheduleProjectionSource(prisma, {
    now: () => due + 1,
  }).buildRoutinePlan(routineId, identityId);
  expect(after.desired).toEqual([]);
  await scheduler.reconcile(after.owner, after.desired);
  expect(
    await prisma.scheduledInvocation.count({
      where: {
        identityId,
        ownerId: routineId,
        status: { in: ['pending', 'retry_wait', 'running'] },
      },
    }),
  ).toBe(0);
  const outbox = await prisma.outboxMessage.findMany({ where: { identityId } });
  expect(outbox).toHaveLength(1);
  return {
    row: await prisma.routineDefinition.findUniqueOrThrow({ where: { id: routineId } }),
    notification: JSON.parse(outbox[0]!.payloadJson),
    plan,
  };
}
it('repairs a lost post-commit signal after reconnect and fires exactly once with the same Mastra owner effect', async () => {
  const a = await identity(),
    b = await identity();
  let events = 0;
  const receipt = await createRoutinePrismaAgentMutations(prisma, {
    now: () => at,
    onScheduleChanged: () => {
      events++;
      throw new Error('lost event');
    },
  }).create(input, cx(a), authority);
  expect(events).toBe(1);
  expect(await prisma.scheduledInvocation.count()).toBe(0);
  const gateway = await projectAndExecute(a, receipt.result.routine.id, due + 1);
  const product = new RoutineAICommandAdapter(composeRoutine({ db: prisma }).routineCommandPort);
  const mastra = await product.createRoutine({
    context: { ...cx(b), startedAt: at },
    name: input.name,
    description: input.description,
    profileIds: [],
    trigger: {
      ...input.trigger,
      recurrence: {
        startDate: input.trigger.startDate,
        frequency: 'daily',
        interval: 1,
        byWeekday: [],
        count: 1,
        until: null,
      },
    },
  });
  const ai = await projectAndExecute(b, mastra.id);
  expect(ai.row.triggerJson).toBe(gateway.row.triggerJson);
  expect(ai.row.version).toBe(1);
  expect(await prisma.routineProfileMembership.count()).toBe(0);
  expect(ai.notification.content).toEqual(gateway.notification.content);
  expect(gateway.notification.content).toMatchObject({
    title: '例行提醒：Review Q4 goals',
    content: 'Private reminder',
  });
  expect(ai.plan.desired[0]!.runAt).toBe(gateway.plan.desired[0]!.runAt);
  expect(ai.plan.desired[0]!.sourceRevision).toBe(gateway.plan.desired[0]!.sourceRevision);
});

it('#552 denies Goal and Task writes revoked after the pool-safe precheck', async () => {
  const f = await fixture();
  const pat = await f.pats.create(f.a, {
    name: 'Goal Task',
    scopes: ['goals:write', 'tasks:write'],
  });
  const writes = bindGatewayWrites(prisma, time);
  const authority = {
    connectionId: pat.id,
    scopes: ['goals:write', 'tasks:write'],
    authorize: async () => {
      await f.pats.revoke(f.a, pat.id);
    },
  };
  await expect(
    writes.goalCreate({ idempotencyKey: '552-goal', goal: { name: 'Denied' } }, cx(f.a), authority),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await prisma.externalAgentPat.update({ where: { id: pat.id }, data: { revokedAt: null } });
  await expect(
    writes.taskCreate(
      {
        idempotencyKey: '552-task',
        plan: {
          name: 'Denied',
          importance: 'Moderate',
          schedule: {
            kind: 'OneTime',
            date: new Date().toISOString().slice(0, 10),
            timing: { kind: 'AllDay' },
          },
        },
      },
      cx(f.a),
      authority,
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await prisma.goal.count()).toBe(0);
  expect(await prisma.taskPlan.count()).toBe(0);
  expect(await prisma.externalMutationReceipt.count()).toBe(0);
});

it('rolls back an owner validation failure and an already-elapsed same-day one-shot', async () => {
  const a = await identity();
  const owner = createRoutinePrismaAgentMutations(prisma, { now: () => at });
  const failure = vi.spyOn(RoutineDefinition, 'create').mockImplementation(() => {
    throw new TypeError('Owner rejected input');
  });
  try {
    await expect(owner.create(input, cx(a), authority)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  } finally {
    failure.mockRestore();
  }
  await expect(
    createRoutinePrismaAgentMutations(prisma, { now: () => due + 1 }).create(
      input,
      cx(a),
      authority,
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(await prisma.routineDefinition.count()).toBe(0);
  expect(await prisma.externalMutationReceipt.count()).toBe(0);
  expect(await prisma.scheduledInvocation.count()).toBe(0);
});

it.each(['scope', 'identity', 'account', 'disabled', 'expiry'] as const)(
  '#552 rejects durable %s changes after precheck without writing owner facts',
  async (change) => {
    const f = await fixture();
    const pat = await f.pats.create(f.a, { name: 'authority race', scopes: ['goals:write'] });
    const writes = bindGatewayWrites(prisma, time);
    const authorize = async () => {
      switch (change) {
        case 'scope':
          await prisma.externalAgentPat.update({
            where: { id: pat.id },
            data: { scopes: ['tasks:read'] },
          });
          break;
        case 'identity':
          await prisma.externalAgentPat.update({ where: { id: pat.id }, data: { userId: f.b } });
          break;
        case 'account':
          await prisma.account.update({ where: { id: f.a }, data: { status: 'Closed' } });
          break;
        case 'disabled':
          await prisma.cloudAuthUser.update({
            where: { id: f.a },
            data: { disabledAt: new Date() },
          });
          break;
        case 'expiry':
          await prisma.externalAgentPat.update({
            where: { id: pat.id },
            data: { expiresAt: new Date(0) },
          });
          break;
      }
    };
    await expect(
      writes.goalCreate({ idempotencyKey: '552-authority', goal: { name: 'Denied' } }, cx(f.a), {
        connectionId: pat.id,
        scopes: ['goals:write'],
        authorize,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await prisma.goal.count({ where: { identityId: f.a } })).toBe(0);
    expect(await prisma.externalMutationReceipt.count({ where: { identityId: f.a } })).toBe(0);
  },
);

it.each(['revocation', 'scope reduction'] as const)(
  '#552 serializes concurrent %s behind the authorized mutation commit',
  async (change) => {
    const f = await fixture();
    const pat = await f.pats.create(f.a, { name: 'commit fence', scopes: ['goals:write'] });
    const principal = { identityId: f.a, credentialId: pat.id, scopes: ['goals:write'] };
    let resume!: () => void;
    const release = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let read!: (value: { tx: Prisma.TransactionClient; pid: number }) => void;
    const credentialRead = new Promise<{ tx: Prisma.TransactionClient; pid: number }>((resolve) => {
      read = resolve;
    });
    const input = {
      idempotencyKey: '552-commit-fence',
      goal: { name: 'Authorized before revocation' },
    };
    const mutation = createGoalPrismaAgentMutations(prisma).create(input, cx(f.a), {
      connectionId: pat.id,
      authorize: async () => {
        expect(await f.pats.authenticate('Bearer ' + pat.secret)).toMatchObject(principal);
      },
      authorizeInTransaction: async (tx) => {
        const allowed = await isScopedPatAuthorityCurrent(
          tx,
          principal,
          async (identityId) => {
            // Pause after the real credential read, before owner facts/receipt are written.
            const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
            read({ tx, pid: backend!.pid });
            await release;
            return createAccountPrismaActiveQuery(tx)(identityId);
          },
          'goals:write',
        );
        if (!allowed) throw new Error('Authority unexpectedly rejected');
      },
    });
    let revocation: Promise<{ goals: number; receipts: number }> | undefined;
    try {
      const writer = await Promise.race([
        credentialRead,
        mutation.then(() => {
          throw new Error('Mutation bypassed the credential barrier');
        }),
      ]);
      let started!: (pid: number) => void;
      const revokerReady = new Promise<number>((resolve) => {
        started = resolve;
      });
      let committed = false;
      revocation = prisma
        .$transaction(async (tx) => {
          const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
          started(backend!.pid);
          await tx.externalAgentPat.update({
            where: { id: pat.id },
            data: change === 'revocation' ? { revokedAt: new Date() } : { scopes: ['tasks:read'] },
          });
          return {
            goals: await tx.goal.count({ where: { identityId: f.a } }),
            receipts: await tx.externalMutationReceipt.count({ where: { identityId: f.a } }),
          };
        })
        .then((result) => {
          committed = true;
          return result;
        });
      const revokerPid = await revokerReady;
      expect(revokerPid).not.toBe(writer.pid);
      // Observe the lock dependency through the paused writer's connection. No third connection or timing guess.
      await expect
        .poll(async () => {
          if (committed) return 'committed-before-mutation';
          const [state] = await writer.tx.$queryRaw<
            { blocked: boolean }[]
          >`SELECT ${writer.pid} = ANY(pg_blocking_pids(${revokerPid})) AS blocked`;
          return state!.blocked ? 'blocked-by-writer' : 'pending';
        })
        .toBe('blocked-by-writer');
      expect(committed).toBe(false);
      resume();
      const receipt = await mutation;
      expect(await revocation).toEqual({ goals: 1, receipts: 1 });
      expect(receipt.replayed).toBe(false);
      // Even a cached authority cannot replay once the waiting revocation has committed.
      await expect(
        bindGatewayWrites(prisma, time).goalCreate(input, cx(f.a), {
          connectionId: pat.id,
          scopes: principal.scopes,
          authorize: async () => {},
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await prisma.goal.count({ where: { identityId: f.a } })).toBe(1);
      expect(await prisma.externalMutationReceipt.count({ where: { identityId: f.a } })).toBe(1);
    } finally {
      resume();
      await Promise.allSettled([mutation, ...(revocation ? [revocation] : [])]);
    }
  },
);
