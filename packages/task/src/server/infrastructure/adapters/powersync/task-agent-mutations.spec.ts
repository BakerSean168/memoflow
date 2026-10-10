import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPowerSyncSqliteFixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import { createTimeContext } from '@memoflow/time';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { createTaskPowerSyncAgentMutations } from './task-agent-mutations';
const cx: ExecutionContext = {
  identityId: 'IdentityId_00000000-0000-4000-8000-000000000001',
  source: 'http',
  requestId: 'test',
  traceId: 'test',
  startedAt: 1,
};
const time = {
  getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
};
const authority = { connectionId: 'connection', authorize: async () => {} };
it('recovers a committed Task snapshot after reopen and enforces update versions and current authority', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'task-agent-receipt-'));
  const path = join(directory, 'profile.db');
  const f = createPowerSyncSqliteFixture(path);
  const input = {
    idempotencyKey: 'lost-response',
    plan: {
      name: 'Durable task',
      importance: 'Moderate',
      schedule: {
        kind: 'OneTime',
        date: new Date().toISOString().slice(0, 10),
        timing: { kind: 'AllDay' },
      },
    },
  };
  const receipt = await createTaskPowerSyncAgentMutations(f.db, time).create(input, cx, authority);
  f.close();
  const reopened = createPowerSyncSqliteFixture(path);
  try {
    const events: string[] = [];
    const port = createTaskPowerSyncAgentMutations(reopened.db, time, undefined, {
      publish: async (event) => {
        events.push(event.eventType);
      },
    });
    if (receipt.result.kind !== 'plan') throw new Error('Expected plan');
    const update = {
      idempotencyKey: 'update',
      planId: receipt.result.plan.id,
      changes: { expectedVersion: receipt.result.plan.version, name: 'Later edit' },
    };
    const updated = await port.update(update, cx, authority);
    expect(await port.update(update, cx, authority)).toEqual(updated);
    await expect(
      port.update({ ...update, idempotencyKey: 'stale' }, cx, authority),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    events.length = 0;
    expect(await port.create(input, cx, authority)).toEqual(receipt);
    expect(events).toEqual([]);
    await expect(
      port.create(input, cx, {
        connectionId: 'connection',
        authorize: async () => {
          throw new Error('revoked');
        },
      }),
    ).rejects.toThrow('revoked');
    expect(reopened.sql.prepare('SELECT COUNT(*) AS n FROM task_plans').get()).toMatchObject({
      n: 1,
    });
  } finally {
    reopened.close();
    await rm(directory, { recursive: true, force: true });
  }
});
it('commits Task changes and immutable receipts once, preserving explicit Prompt contribution choices', async () => {
  const f = createPowerSyncSqliteFixture();
  try {
    const port = createTaskPowerSyncAgentMutations(f.db, time, () => ({
      getKeyResultMeasurementContext: async () => ({
        ok: true as const,
        data: {
          id: 'IKeyResultId_00000000-0000-4000-8000-000000000001',
          title: 'Sum',
          progress: {
            aggregationMethod: 'Sum' as const,
            initialValue: 0,
            trackingBaseValue: 0,
            currentValue: 0,
            targetValue: 10,
            unit: null,
          },
        },
      }),
    }));
    const plan = {
      name: 'Agent task',
      importance: 'Moderate',
      schedule: {
        kind: 'OneTime',
        date: new Date().toISOString().slice(0, 10),
        timing: { kind: 'AllDay' },
      },
      goalBinding: {
        goalId: 'IGoalId_00000000-0000-4000-8000-000000000001',
        keyResultId: 'IKeyResultId_00000000-0000-4000-8000-000000000001',
        progressRule: { mode: 'Prompt', trigger: 'EachCompletion', suggestedValue: 99 },
      },
    };
    const input = { idempotencyKey: 'create', plan };
    const [one, two] = await Promise.all([
      port.create(input, cx, authority),
      port.create(input, cx, authority),
    ]);
    expect(one).toEqual(two);
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_plans').get()).toMatchObject({ n: 1 });
    if (one.result.kind !== 'plan') throw new Error('Expected plan');
    const occurrence = f.sql
      .prepare('SELECT id,version FROM task_occurrences WHERE plan_id=?')
      .get(one.result.plan.id);
    if (!occurrence) throw new Error('Expected generated occurrence');
    const completion = {
      idempotencyKey: 'complete-only',
      occurrenceId: occurrence.id,
      expectedVersion: occurrence.version,
      completion: { decision: 'complete_only' },
    };
    const completed = await port.complete(completion, cx, authority);
    expect(await port.complete(completion, cx, authority)).toEqual(completed);
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_goal_outbox').get()).toMatchObject({
      n: 0,
    });
    await expect(
      port.complete({ ...completion, idempotencyKey: 'stale' }, cx, authority),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const second = await port.create({ idempotencyKey: 'second', plan }, cx, authority);
    if (second.result.kind !== 'plan') throw new Error('Expected plan');
    const secondOccurrence = f.sql
      .prepare('SELECT id,version FROM task_occurrences WHERE plan_id=?')
      .get(second.result.plan.id);
    const measured = {
      idempotencyKey: 'measure',
      occurrenceId: secondOccurrence?.id,
      expectedVersion: secondOccurrence?.version,
      completion: { decision: 'record', measurement: { value: 3 } },
    };
    await port.complete(measured, cx, authority);
    await port.complete(measured, cx, authority);
    const outbox = f.sql.prepare('SELECT payload FROM task_goal_outbox').all();
    expect(outbox).toHaveLength(1);
    expect(JSON.parse(String(outbox[0].payload))).toMatchObject({ value: 3 });
    const fixed = await port.create(
      {
        idempotencyKey: 'fixed',
        plan: {
          ...plan,
          goalBinding: {
            ...plan.goalBinding,
            progressRule: { mode: 'Fixed', trigger: 'EachCompletion', value: 2 },
          },
        },
      },
      cx,
      authority,
    );
    if (fixed.result.kind !== 'plan') throw new Error('Expected plan');
    const fixedOccurrence = f.sql
      .prepare('SELECT id,version FROM task_occurrences WHERE plan_id=?')
      .get(fixed.result.plan.id)!;
    const finishFixed = {
      idempotencyKey: 'fixed-complete',
      occurrenceId: fixedOccurrence.id,
      expectedVersion: fixedOccurrence.version,
      completion: { decision: 'complete_only' },
    };
    f.sql.exec(
      "CREATE TRIGGER fail_completion_receipt BEFORE INSERT ON task_agent_mutation_receipts WHEN NEW.capability='task.occurrence.complete.v1' BEGIN SELECT RAISE(ABORT, 'injected'); END",
    );
    await expect(port.complete(finishFixed, cx, authority)).rejects.toThrow();
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_goal_outbox').get()).toMatchObject({
      n: 1,
    });
    expect(
      f.sql.prepare('SELECT status FROM task_occurrences WHERE id=?').get(fixedOccurrence.id),
    ).toMatchObject({ status: 'Pending' });
    f.sql.exec('DROP TRIGGER fail_completion_receipt');
    const fixedResult = await port.complete(finishFixed, cx, authority);
    expect(await port.complete(finishFixed, cx, authority)).toEqual(fixedResult);
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_goal_outbox').get()).toMatchObject({
      n: 2,
    });
    await expect(
      port.create({ ...input, plan: { ...plan, name: 'Conflict' } }, cx, authority),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  } finally {
    f.close();
  }
});
it('rolls back generated occurrences and TaskPlan when receipt insertion fails', async () => {
  const f = createPowerSyncSqliteFixture();
  try {
    f.sql.exec(
      "CREATE TRIGGER fail_receipt BEFORE INSERT ON task_agent_mutation_receipts BEGIN SELECT RAISE(ABORT, 'injected'); END",
    );
    const port = createTaskPowerSyncAgentMutations(f.db, time);
    await expect(
      port.create(
        {
          idempotencyKey: 'fail',
          plan: {
            name: 'Rollback',
            importance: 'Moderate',
            schedule: {
              kind: 'OneTime',
              date: new Date().toISOString().slice(0, 10),
              timing: { kind: 'AllDay' },
            },
          },
        },
        cx,
        authority,
      ),
    ).rejects.toThrow();
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_plans').get()).toMatchObject({ n: 0 });
    expect(f.sql.prepare('SELECT COUNT(*) AS n FROM task_occurrences').get()).toMatchObject({
      n: 0,
    });
  } finally {
    f.close();
  }
});
