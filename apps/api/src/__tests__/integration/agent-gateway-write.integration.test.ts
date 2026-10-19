import { afterAll, beforeEach, expect, it } from 'vitest';
import { prisma } from '@memoflow/database';
import { IdentityId } from '@memoflow/domain-shared';
import { createGoalPrismaAgentMutations } from '@memoflow/goal';
import { createTaskPrismaAgentMutations } from '@memoflow/task';
import { createTimeContext } from '@memoflow/time';
import {
  cleanAll,
  disconnectPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';

const cx = (identityId: string) => ({
  identityId,
  source: 'http' as const,
  requestId: 'write',
  traceId: 'write',
  startedAt: Date.now(),
});
const authority = { connectionId: 'credential-a', authorize: async () => {} };
const time = {
  getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
};
beforeEach(cleanAll);
afterAll(disconnectPrisma);
it('replays the committed Goal snapshot after disconnect, rejects changed input and isolates identities', async () => {
  const a = String(IdentityId.generate());
  const b = String(IdentityId.generate());
  await seedAccount({ id: a });
  await seedAccount({ id: b });
  const input = { idempotencyKey: 'lost-response', goal: { name: 'Original' } };
  const first = await createGoalPrismaAgentMutations(prisma).create(input, cx(a), authority);
  const port = createGoalPrismaAgentMutations(prisma);
  await port.update(
    {
      idempotencyKey: 'edit',
      goalId: first.result.goalId,
      changes: { expectedVersion: first.result.goalVersion, name: 'Later' },
    },
    cx(a),
    authority,
  );
  await prisma.$disconnect();
  const replay = await createGoalPrismaAgentMutations(prisma).create(input, cx(a), authority);
  expect(replay).toEqual({ ...first, replayed: true });
  expect(first.result).not.toHaveProperty('readModel');
  expect(first.result).not.toHaveProperty('recordChanges');
  expect(
    (
      await prisma.goal.findUniqueOrThrow({
        where: { id: first.result.goalId },
        select: { name: true },
      })
    ).name,
  ).toBe('Original');
  const stored = await prisma.externalMutationReceipt.findUniqueOrThrow({
    where: { id: first.receiptId },
  });
  expect(JSON.parse(stored.resultJson)).toEqual({ receiptId: first.receiptId, result: first.result });
  expect(await prisma.goal.count({ where: { identityId: a } })).toBe(1);
  const rotated = await createGoalPrismaAgentMutations(prisma).create(input, cx(a), {
    ...authority,
    connectionId: 'credential-b',
  });
  expect(rotated).toEqual({ ...first, replayed: true });
  expect(await prisma.goal.count({ where: { identityId: a } })).toBe(1);
  await expect(
    port.create({ ...input, goal: { name: 'Changed' } }, cx(a), authority),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(
    port.create({ ...input, goal: { name: 'Changed' } }, cx(a), {
      ...authority,
      connectionId: 'credential-b',
    }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(
    port.update(
      {
        idempotencyKey: 'foreign',
        goalId: first.result.goalId,
        changes: { expectedVersion: 1, name: 'Stolen' },
      },
      cx(b),
      authority,
    ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    port.update(
      {
        idempotencyKey: 'stale',
        goalId: first.result.goalId,
        changes: { expectedVersion: 1, name: 'Stale' },
      },
      cx(a),
      authority,
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('uses the same receipt mechanism for concurrent TaskPlan creation and completion CAS', async () => {
  const a = String(IdentityId.generate());
  await seedAccount({ id: a });
  const port = createTaskPrismaAgentMutations(prisma, time);
  const plan = {
    name: 'Task',
    importance: 'Moderate',
    schedule: {
      kind: 'OneTime',
      date: new Date().toISOString().slice(0, 10),
      timing: { kind: 'AllDay' },
    },
  };
  const input = { idempotencyKey: 'task', plan };
  const [first, duplicate] = await Promise.all([
    port.create(input, cx(a), authority),
    port.create(input, cx(a), authority),
  ]);
  expect(first.receiptId).toBe(duplicate.receiptId);
  expect([first.replayed, duplicate.replayed].sort()).toEqual([false, true]);
  if (first.result.kind !== 'plan') throw new Error('plan');
  expect(Object.keys(first.result.plan).sort()).toEqual(['id', 'version']);
  const storedTask = await prisma.externalMutationReceipt.findUniqueOrThrow({
    where: { id: first.receiptId },
  });
  expect(Object.keys(JSON.parse(storedTask.resultJson).result.plan).sort()).toEqual([
    'id',
    'version',
  ]);
  const occurrence = await prisma.taskOccurrence.findFirstOrThrow({
    where: { planId: first.result.plan.id },
  });
  const completion = {
    idempotencyKey: 'complete',
    occurrenceId: occurrence.id,
    expectedVersion: occurrence.version,
    completion: { decision: 'complete_only' },
  };
  const done = await port.complete(completion, cx(a), authority);
  expect(await port.complete(completion, cx(a), authority)).toEqual({ ...done, replayed: true });
  await expect(
    port.complete({ ...completion, idempotencyKey: 'stale' }, cx(a), authority),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(await prisma.taskPlan.count({ where: { identityId: a } })).toBe(1);
});

it('rolls back Owner facts when receipt persistence fails', async () => {
  const a = String(IdentityId.generate());
  await seedAccount({ id: a });
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION eag490_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt fault'; END $$`,
  );
  await prisma.$executeRawUnsafe(
    'CREATE TRIGGER eag490_receipt_fault BEFORE INSERT ON external_mutation_receipts FOR EACH ROW EXECUTE FUNCTION eag490_reject_receipt()',
  );
  try {
    await expect(
      createGoalPrismaAgentMutations(prisma).create(
        { idempotencyKey: 'rollback', goal: { name: 'No partial Goal' } },
        cx(a),
        authority,
      ),
    ).rejects.toThrow();
    expect(await prisma.goal.count({ where: { identityId: a } })).toBe(0);
    expect(await prisma.externalMutationReceipt.count({ where: { identityId: a } })).toBe(0);
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER eag490_receipt_fault ON external_mutation_receipts',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION eag490_reject_receipt()');
  }
});

it('revalidates the write authority before the receipt transaction opens', async () => {
  const a = String(IdentityId.generate());
  await seedAccount({ id: a });
  type TransactionCall = (...args: unknown[]) => Promise<unknown>;
  const client = prisma as unknown as { $transaction: TransactionCall };
  const original = client.$transaction.bind(prisma) as TransactionCall;
  let active = 0;
  const observedDuringAuthorize: number[] = [];
  client.$transaction = async (...args: unknown[]) => {
    active += 1;
    try {
      return await original(...args);
    } finally {
      active -= 1;
    }
  };
  try {
    await createGoalPrismaAgentMutations(prisma).create(
      { idempotencyKey: 'authorize-first', goal: { name: 'Authority' } },
      cx(a),
      {
        connectionId: 'credential-a',
        // The old code revalidated inside the open receipt transaction.
        authorize: async () => {
          observedDuringAuthorize.push(active);
        },
      },
    );
  } finally {
    client.$transaction = original;
  }
  expect(observedDuringAuthorize).toEqual([0]);
});

it('rolls back Task facts when receipt persistence fails', async () => {
  const a = String(IdentityId.generate());
  await seedAccount({ id: a });
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION eag542_reject_task_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'task receipt fault'; END $$`,
  );
  await prisma.$executeRawUnsafe(
    'CREATE TRIGGER eag542_task_receipt_fault BEFORE INSERT ON external_mutation_receipts FOR EACH ROW EXECUTE FUNCTION eag542_reject_task_receipt()',
  );
  try {
    await expect(
      createTaskPrismaAgentMutations(prisma, time).create(
        {
          idempotencyKey: 'task-rollback',
          plan: {
            name: 'No partial Task',
            importance: 'Moderate',
            schedule: {
              kind: 'OneTime',
              date: new Date().toISOString().slice(0, 10),
              timing: { kind: 'AllDay' },
            },
          },
        },
        cx(a),
        authority,
      ),
    ).rejects.toThrow();
    expect(await prisma.taskPlan.count({ where: { identityId: a } })).toBe(0);
    expect(await prisma.taskOccurrence.count({ where: { identityId: a } })).toBe(0);
    expect(await prisma.externalMutationReceipt.count({ where: { identityId: a } })).toBe(0);
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER eag542_task_receipt_fault ON external_mutation_receipts',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION eag542_reject_task_receipt()');
  }
});

it('rejects a Task retry that reuses an idempotency key with different input', async () => {
  const a = String(IdentityId.generate());
  await seedAccount({ id: a });
  const port = createTaskPrismaAgentMutations(prisma, time);
  const plan = {
    name: 'Task once',
    importance: 'Moderate',
    schedule: {
      kind: 'OneTime',
      date: new Date().toISOString().slice(0, 10),
      timing: { kind: 'AllDay' },
    },
  };
  const input = { idempotencyKey: 'task-conflict', plan };
  const first = await port.create(input, cx(a), authority);
  await expect(
    port.create({ ...input, plan: { ...plan, name: 'Task twice' } }, cx(a), authority),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  expect(await port.create(input, cx(a), authority)).toEqual({ ...first, replayed: true });
  expect(await prisma.taskPlan.count({ where: { identityId: a } })).toBe(1);
});

it('adds and updates KRs using Goal CAS and replays each original result', async () => {
  const a = String(IdentityId.generate());
  await seedAccount({ id: a });
  const port = createGoalPrismaAgentMutations(prisma);
  const created = await port.create(
    {
      idempotencyKey: 'with-kr',
      goal: { name: 'Goal', initialKeyResults: [{ title: 'Initial', targetValue: 10 }] },
    },
    cx(a),
    authority,
  );
  expect(created.result.affectedEntityIds.keyResultIds).toHaveLength(1);
  expect(await prisma.keyResult.count({ where: { goalId: created.result.goalId } })).toBe(1);
  const add = {
    idempotencyKey: 'add-kr',
    goalId: created.result.goalId,
    keyResult: { title: 'Added', targetValue: 20, expectedVersion: created.result.goalVersion },
  };
  const added = await port.createKeyResult(add, cx(a), authority);
  expect(added.result.affectedEntityIds.keyResultIds).toHaveLength(1);
  expect(await prisma.keyResult.count({ where: { goalId: created.result.goalId } })).toBe(2);
  const krId = added.result.affectedEntityIds.keyResultIds[0];
  const update = {
    idempotencyKey: 'update-kr',
    goalId: created.result.goalId,
    keyResultId: krId,
    changes: { title: 'Changed', targetValue: 30, expectedVersion: added.result.goalVersion },
  };
  const updated = await port.updateKeyResult(update, cx(a), authority);
  expect(
    (await prisma.keyResult.findUniqueOrThrow({ where: { id: krId }, select: { title: true } }))
      .title,
  ).toBe('Changed');
  expect(updated.result.affectedEntityIds.keyResultIds).toEqual([krId]);
  expect(await port.createKeyResult(add, cx(a), authority)).toEqual({ ...added, replayed: true });
  await expect(
    port.updateKeyResult({ ...update, idempotencyKey: 'stale-kr' }, cx(a), authority),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
});

import { createReadGateway } from '@memoflow/agent-gateway/server';
import { createScopedPatService } from '@memoflow/cloud-auth/server';
import { createAccountPrismaActiveQuery } from '@memoflow/account';
import { bindGatewayWrites } from '../../modules/agent-gateway/write.port';
import { createGoalPrismaAgentReadPort, createGoalTaskProgressPrismaHandler } from '@memoflow/goal';
import { createTaskPrismaGoalOutboxRuntime } from '@memoflow/task';

const audience = 'https://eag490.test/mcp';
function request(
  secret: string,
  method: string,
  name = '',
  args: unknown = {},
  signal?: AbortSignal,
) {
  return new Request(audience, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': method,
      ...(name ? { 'Mcp-Name': name } : {}),
      authorization: 'Bearer ' + secret,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: {
        ...(name ? { name, arguments: args } : {}),
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'eag490', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
}
async function gatewayFixture() {
  const a = String(IdentityId.generate()),
    b = String(IdentityId.generate());
  await seedAccount({ id: a });
  await seedAccount({ id: b });
  const pats = createScopedPatService({
    database: prisma,
    audience,
    accountIsActive: createAccountPrismaActiveQuery(prisma),
  });
  const pa = await pats.create(a, {
    name: 'write A',
    scopes: ['goals:write', 'tasks:write', 'goals:read'],
  });
  const pb = await pats.create(b, { name: 'write B', scopes: ['goals:write', 'tasks:write'] });
  const read = await pats.create(a, { name: 'read', scopes: ['goals:read'] });
  const audit: unknown[] = [];
  const options = {
    enabled: true,
    audience,
    trustedOrigins: [],
    cursorSecret: 'test-only-secret-'.repeat(3),
    credentials: { authenticate: pats.authenticate, consumeReadQuota: pats.consumeReadQuota },
    consumeOwnerQuota: async () => true,
    audit: (event: unknown) => audit.push(event),

    goals: {
      getGoal: async () => null,
      searchGoalPage: async () => ({ items: [], hasMore: false, next: null }),
    },
  };
  return {
    a,
    b,
    pa,
    pb,
    read,
    pats,
    audit,
    options,
    gateway: createReadGateway({ ...options, writes: bindGatewayWrites(prisma, time) }),
  };
}
it('enforces PAT scope, default-off discovery, strict input, two-identity writes and durable audit', async () => {
  const f = await gatewayFixture();
  const send = (secret: string, method: string, name = '', args: unknown = {}) =>
    f.gateway.fetch(request(secret, method, name, args), cx(f.a));
  const listed = await (await send(f.pa.secret, 'tools/list')).json();
  expect(listed, JSON.stringify(listed)).toHaveProperty('result.tools');
  expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toContain('goal_create');
  const disabled = createReadGateway(f.options);
  const off = await (await disabled.fetch(request(f.pa.secret, 'tools/list'), cx(f.a))).json();
  expect(off.result.tools.map((tool: { name: string }) => tool.name)).not.toContain('goal_create');
  expect(
    (
      await send(f.read.secret, 'tools/call', 'goal_create', {
        idempotencyKey: 'denied',
        goal: { name: 'Denied' },
      })
    ).status,
  ).toBe(403);
  const input = { idempotencyKey: 'http-lost', goal: { name: 'HTTP Goal' } };
  const first = await (await send(f.pa.secret, 'tools/call', 'goal_create', input)).json();
  const receipt = first.result.structuredContent;
  expect(receipt.replayed).toBe(false);
  expect(receipt.result).not.toHaveProperty('readModel');
  // Recreate the transport and discard the first response: durable replay survives the HTTP lifetime.
  const replay = await (
    await createReadGateway({ ...f.options, writes: bindGatewayWrites(prisma, time) }).fetch(
      request(f.pa.secret, 'tools/call', 'goal_create', input),
      cx(f.a),
    )
  ).json();
  expect(replay.result.structuredContent).toEqual({ ...receipt, replayed: true });
  const foreign = await (
    await send(f.pb.secret, 'tools/call', 'goal_update', {
      idempotencyKey: 'foreign',
      goalId: receipt.result.goalId,
      changes: { expectedVersion: 1, name: 'Stolen' },
    })
  ).json();
  expect(foreign.result).toMatchObject({ isError: true, content: [{ text: 'NOT_FOUND' }] });
  const invalid = await (
    await send(f.pa.secret, 'tools/call', 'goal_create', { ...input, ownerId: f.b })
  ).json();
  expect(invalid.result?.isError ?? Boolean(invalid.error)).toBe(true);
  expect(f.audit).toContainEqual(
    expect.objectContaining({ effect: 'write', receiptId: receipt.receiptId, replayed: true }),
  );
  expect(JSON.stringify(f.audit)).not.toContain(f.pa.secret);
  await f.pats.revoke(f.a, f.pa.id);
  expect((await send(f.pa.secret, 'tools/call', 'goal_create', input)).status).toBe(401);
});

it('recovers Prompt contribution via existing outbox after reconnect with one GoalRecord', async () => {
  const a = String(IdentityId.generate());
  await seedAccount({ id: a });
  const goal = await createGoalPrismaAgentMutations(prisma).create(
    {
      idempotencyKey: 'goal',
      goal: { name: 'Measurement', initialKeyResults: [{ title: 'Units', targetValue: 100 }] },
    },
    cx(a),
    authority,
  );
  const keyResultId = goal.result.affectedEntityIds.keyResultIds[0];
  const port = createTaskPrismaAgentMutations(prisma, time, createGoalPrismaAgentReadPort);
  const created = await port.create(
    {
      idempotencyKey: 'prompt',
      plan: {
        name: 'Prompt task',
        importance: 'Moderate',
        schedule: {
          kind: 'OneTime',
          date: new Date().toISOString().slice(0, 10),
          timing: { kind: 'AllDay' },
        },
        goalBinding: {
          goalId: goal.result.goalId,
          keyResultId,
          progressRule: { mode: 'Prompt', trigger: 'EachCompletion', suggestedValue: 99 },
        },
      },
    },
    cx(a),
    authority,
  );
  if (created.result.kind !== 'plan') throw new Error('plan');
  const occurrence = await prisma.taskOccurrence.findFirstOrThrow({
    where: { planId: created.result.plan.id },
  });
  const input = {
    idempotencyKey: 'record',
    occurrenceId: occurrence.id,
    expectedVersion: occurrence.version,
    completion: { decision: 'record', measurement: { value: 3 } },
  };
  const completed = await port.complete(input, cx(a), authority);
  expect(await prisma.taskGoalOutbox.count({ where: { taskOccurrenceId: occurrence.id } })).toBe(1);
  expect(await prisma.goalRecord.count({ where: { keyResultId } })).toBe(0);
  await prisma.$disconnect();
  expect(
    await createTaskPrismaAgentMutations(prisma, time, createGoalPrismaAgentReadPort).complete(
      input,
      cx(a),
      authority,
    ),
  ).toEqual({ ...completed, replayed: true });
  const runtime = createTaskPrismaGoalOutboxRuntime(
    prisma,
    createGoalTaskProgressPrismaHandler(prisma),
  );
  try {
    await runtime.start();
    await expect.poll(() => prisma.goalRecord.count({ where: { keyResultId } })).toBe(1);
    expect(await prisma.keyResult.findUniqueOrThrow({ where: { id: keyResultId } })).toMatchObject({
      currentValue: 3,
    });
  } finally {
    await runtime.stop();
  }
});

it('returns the durable result after transport abort at the commit/response boundary', async () => {
  const f = await gatewayFixture();
  const writes = bindGatewayWrites(prisma, time);
  const controller = new AbortController();
  const interrupted = createReadGateway({
    ...f.options,
    writes: {
      ...writes,
      goalCreate: async (...args) => {
        const result = await writes.goalCreate(...args);
        controller.abort(); // Owner committed; no HTTP response can reach the client.
        return result;
      },
    },
  });
  const input = { idempotencyKey: 'abort-after-commit', goal: { name: 'Once despite disconnect' } };
  const response = await interrupted.fetch(
    request(f.pa.secret, 'tools/call', 'goal_create', input, controller.signal),
    cx(f.a),
  );
  expect(response.status).toBe(504);
  const recovered = await (
    await f.gateway.fetch(request(f.pa.secret, 'tools/call', 'goal_create', input), cx(f.a))
  ).json();
  expect(recovered.result.structuredContent.replayed).toBe(true);
  expect(await prisma.goal.count({ where: { identityId: f.a } })).toBe(1);
});

it('rejects foreign Task updates/completions and foreign Goal bindings; Task update replay preserves the snapshot', async () => {
  const f = await gatewayFixture();
  const writes = bindGatewayWrites(prisma, time);
  const auth = { ...authority, scopes: ['tasks:write', 'goals:write', 'goals:read'] };
  const input = {
    idempotencyKey: 'task',
    plan: {
      name: 'Owned task',
      importance: 'Moderate',
      schedule: {
        kind: 'OneTime',
        date: new Date().toISOString().slice(0, 10),
        timing: { kind: 'AllDay' },
      },
    },
  };
  const created = await writes.taskCreate(input, cx(f.a), auth);
  if (created.result.kind !== 'plan') throw new Error('plan');
  const update = {
    idempotencyKey: 'edit-task',
    planId: created.result.plan.id,
    changes: { name: 'Changed', expectedVersion: created.result.plan.version },
  };
  const changed = await writes.taskUpdate(update, cx(f.a), auth);
  expect(await writes.taskUpdate(update, cx(f.a), auth)).toEqual({ ...changed, replayed: true });
  await expect(
    writes.taskUpdate({ ...update, idempotencyKey: 'stale' }, cx(f.a), auth),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(writes.taskUpdate(update, cx(f.b), auth)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  const occurrence = await prisma.taskOccurrence.findFirstOrThrow({
    where: { planId: created.result.plan.id },
  });
  await expect(
    writes.taskComplete(
      {
        idempotencyKey: 'foreign-complete',
        occurrenceId: occurrence.id,
        expectedVersion: occurrence.version,
        completion: { decision: 'complete_only' },
      },
      cx(f.b),
      auth,
    ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const goal = await writes.goalCreate(
    { idempotencyKey: 'goal-b', goal: { name: 'B secret', initialKeyResults: [{ title: 'B KR', targetValue: 10 }] } },
    cx(f.b),
    auth,
  );
  await expect(
    writes.taskCreate(
      {
        ...input,
        idempotencyKey: 'foreign-binding',
        plan: { ...input.plan, goalBinding: { goalId: goal.result.goalId } },
      },
      cx(f.a),
      auth,
    ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const ownGoal = await writes.goalCreate({ idempotencyKey: 'goal-a', goal: { name: 'A goal' } }, cx(f.a), auth);
  await expect(writes.taskCreate({
    ...input, idempotencyKey: 'foreign-kr-without-rule',
    plan: { ...input.plan, goalBinding: { goalId: ownGoal.result.goalId, keyResultId: goal.result.affectedEntityIds.keyResultIds[0] } },
  }, cx(f.a), auth)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    writes.taskCreate(
      {
        ...input,
        idempotencyKey: 'no-scope',
        plan: { ...input.plan, goalBinding: { goalId: goal.result.goalId } },
      },
      cx(f.a),
      { ...authority, scopes: ['tasks:write'] },
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
