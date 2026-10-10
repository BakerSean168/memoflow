import { createPowerSyncSqliteFixture as fixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { createGoalPowerSyncAgentMutations } from './goal-agent-mutations';

const cx: ExecutionContext = {
  identityId: 'IdentityId_00000000-0000-4000-8000-000000000001',
  requestId: 'request',
  traceId: 'request',
  source: 'http',
  startedAt: 1,
};
it('recovers the original committed Goal receipt after a lost response and database reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goal-agent-receipt-'));
  const path = join(directory, 'profile.db');
  const first = fixture(path);
  const input = { idempotencyKey: 'lost-response', goal: { name: 'Durable Goal' } };
  const authority = { connectionId: 'connection', authorize: async () => {} };
  const receipt = await createGoalPowerSyncAgentMutations(first.db).create(input, cx, authority);
  first.close();
  const reopened = fixture(path);
  try {
    const events: string[] = [];
    const port = createGoalPowerSyncAgentMutations(reopened.db, {
      publish: async (event) => {
        events.push(event.eventType);
      },
    });
    await port.update(
      {
        idempotencyKey: 'later',
        goalId: receipt.result.goalId,
        changes: { expectedVersion: receipt.result.goalVersion, name: 'Later edit' },
      },
      cx,
      authority,
    );
    events.length = 0;
    expect(await port.create(input, cx, authority)).toEqual(receipt);
    expect(events).toEqual([]);
    expect(reopened.sql.prepare('SELECT COUNT(*) AS n FROM goals').get()).toMatchObject({ n: 1 });
  } finally {
    reopened.close();
    await rm(directory, { recursive: true, force: true });
  }
});
it('commits one Goal and immutable receipt, rejects changed inputs and stale versions, and rechecks revoked authorization', async () => {
  const { db, sql } = fixture();
  let authorized = true;
  const events: string[] = [];
  const port = createGoalPowerSyncAgentMutations(db, {
    publish: async (event) => {
      events.push(event.eventType);
    },
  });
  const authority = {
    connectionId: 'connection',
    authorize: async () => {
      if (!authorized) throw new Error('revoked');
    },
  };
  try {
    const input = { idempotencyKey: 'create-1', goal: { name: 'Original' } };
    const [one, two] = await Promise.all([
      port.create(input, cx, authority),
      port.create(input, cx, authority),
    ]);
    expect(one).toEqual(two);
    expect(sql.prepare('SELECT COUNT(*) AS n FROM goals').get()).toMatchObject({ n: 1 });
    const emitted = events.length;
    const updated = await port.update(
      {
        idempotencyKey: 'update-1',
        goalId: one.result.goalId,
        changes: { expectedVersion: one.result.goalVersion, name: 'Changed' },
      },
      cx,
      authority,
    );
    expect(updated.result.goalVersion).toBe(one.result.goalVersion + 1);
    expect(await port.create(input, cx, authority)).toEqual(one);
    expect(events.length).toBeGreaterThanOrEqual(emitted);
    await expect(
      port.create({ ...input, goal: { name: 'Different' } }, cx, authority),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      port.update(
        {
          idempotencyKey: 'stale',
          goalId: one.result.goalId,
          changes: { expectedVersion: one.result.goalVersion, name: 'Stale' },
        },
        cx,
        authority,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const beforeReplay = events.length;
    await port.create(input, cx, authority);
    expect(events.length).toBe(beforeReplay);
    authorized = false;
    await expect(port.create(input, cx, authority)).rejects.toThrow('revoked');
    expect(sql.prepare('SELECT COUNT(*) AS n FROM goal_operation_receipts').get()).toMatchObject({
      n: 2,
    });
  } finally {
    sql.close();
  }
});
it('rolls back the real Goal mutation when receipt persistence fails', async () => {
  const { db, sql } = fixture();
  const events: string[] = [];
  try {
    sql.exec(
      "CREATE TRIGGER fail_receipt BEFORE INSERT ON goal_operation_receipts BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END",
    );
    const port = createGoalPowerSyncAgentMutations(db, {
      publish: async (event) => {
        events.push(event.eventType);
      },
    });
    await expect(
      port.create({ idempotencyKey: 'rollback', goal: { name: 'Must roll back' } }, cx, {
        connectionId: 'connection',
        authorize: async () => {},
      }),
    ).rejects.toThrow();
    expect(sql.prepare('SELECT COUNT(*) AS n FROM goals').get()).toMatchObject({ n: 0 });
    expect(events).toEqual([]);
  } finally {
    sql.close();
  }
});
