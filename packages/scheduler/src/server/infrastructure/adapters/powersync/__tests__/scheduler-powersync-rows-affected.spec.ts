import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PowerSyncDatabase } from '@powersync/node';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PowerSyncScheduledInvocationRepository } from '../scheduled-invocation-powersync.repository';
import { PowerSyncInvocationAttemptRepository } from '../invocation-attempt-powersync.repository';
import { createScheduleLeasePowerSyncRepository } from '../../../lease/schedule-lease.repository';

let db: PowerSyncDatabase;
let dbPath: string;
let repo: PowerSyncScheduledInvocationRepository;
const now = Date.parse('2026-10-29T00:00:00.000Z');
const iso = (time: number) => new Date(time).toISOString();
const claimInput = {
  invocationId: 'inv',
  identityId: 'identity',
  claimToken: 'claim',
  claimExpiresAt: now + 1000,
  now,
};
const completeInput = {
  invocationId: 'inv',
  identityId: 'identity',
  claimToken: 'claim',
  fencingToken: 1,
  attemptNumber: 1,
  outcome: 'retryable_failure' as const,
  status: 'retry_wait' as const,
  nextAttemptAt: now + 5000,
  finishedAt: now,
  failureRetryable: true,
};

beforeEach(async () => {
  dbPath = path.join(os.tmpdir(), `memoflow-scheduler-${randomUUID()}.db`);
  db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: dbPath },
  });
  await db.waitForReady();
  repo = new PowerSyncScheduledInvocationRepository(db);
  await db.execute(
    `INSERT INTO scheduled_invocations (id, identity_id, owner_type, owner_id, scheduling_key, handler_key, payload_version, payload, run_at, retry_enabled, max_retries, initial_delay_ms, max_delay_ms, backoff_multiplier, priority, status, attempt_count, fencing_token, created_at, updated_at) VALUES ('inv', 'identity', 'task', 'owner', 'key', 'handler', 1, '{}', ?, 1, 2, 100, 1000, 2, 'normal', 'pending', 0, 0, ?, ?)`,
    [iso(now), iso(now), iso(now)],
  );
});
afterEach(async () => {
  await db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});
const stored = () => db.get('SELECT * FROM scheduled_invocations WHERE id = ?', ['inv']);
const attempts = () => db.getAll('SELECT * FROM invocation_attempts ORDER BY id');
async function seedRunning() {
  await db.execute(
    `UPDATE scheduled_invocations SET status = 'running', attempt_count = 1, fencing_token = 1, claim_token = 'claim', claim_expires_at = ? WHERE id = 'inv'`,
    [iso(now - 1)],
  );
  await db.execute(
    `INSERT INTO invocation_attempts (id, identity_id, invocation_id, attempt_number, started_at, outcome, claim_token, fencing_token, created_at) VALUES ('attempt', 'identity', 'inv', 1, ?, 'timeout', 'claim', 1, ?)`,
    [iso(now - 1000), iso(now - 1000)],
  );
}

describe('scheduler stored-state guards on real PowerSync (#709)', () => {
  it('proves both canonical tables are views with zero affected rows', async () => {
    await expect(
      db.getAll(
        `SELECT name, type FROM sqlite_master WHERE name IN ('scheduled_invocations', 'invocation_attempts') ORDER BY name`,
      ),
    ).resolves.toEqual([
      { name: 'invocation_attempts', type: 'view' },
      { name: 'scheduled_invocations', type: 'view' },
    ]);
    expect(
      (await db.execute(`UPDATE scheduled_invocations SET name = 'written' WHERE id = 'inv'`))
        .rowsAffected,
    ).toBe(0);
    expect(await stored()).toMatchObject({ name: 'written' });
    await seedRunning();
    expect(
      (
        await db.execute(
          `UPDATE invocation_attempts SET worker_id = 'written' WHERE id = 'attempt'`,
        )
      ).rowsAffected,
    ).toBe(0);
    expect(await attempts()).toEqual([expect.objectContaining({ worker_id: 'written' })]);
  });
  for (const ownerTransaction of [false, true]) {
    for (const status of ['pending', 'retry_wait']) {
      it(`claims due ${status}, owner transaction ${ownerTransaction}`, async () => {
        await db.execute(
          'UPDATE scheduled_invocations SET status = ?, next_attempt_at = ? WHERE id = ?',
          [status, iso(now), 'inv'],
        );
        const result = await (ownerTransaction
          ? repo.withTransaction((tx) => tx.claimAndStart(claimInput))
          : repo.claimAndStart(claimInput));
        expect(result).toMatchObject({
          invocation: {
            status: 'running',
            attemptCount: 1,
            fencingToken: 1,
            claimToken: 'claim',
            nextAttemptAt: null,
          },
          attempt: { attemptNumber: 1, fencingToken: 1, claimToken: 'claim' },
        });
        expect(await stored()).toMatchObject({
          status: 'running',
          attempt_count: 1,
          fencing_token: 1,
        });
        expect(await attempts()).toEqual([
          expect.objectContaining({
            id: result?.attempt.id,
            finished_at: null,
          }),
        ]);
      });
    }
    it(`completes both view rows, owner transaction ${ownerTransaction}`, async () => {
      await seedRunning();
      await expect(
        ownerTransaction
          ? repo.withTransaction((tx) => tx.completeAttempt(completeInput))
          : repo.completeAttempt(completeInput),
      ).resolves.toBe(true);
      expect(await stored()).toMatchObject({
        status: 'retry_wait',
        next_attempt_at: iso(now + 5000),
        claim_token: null,
        claim_expires_at: null,
      });
      expect(await attempts()).toEqual([
        expect.objectContaining({
          finished_at: iso(now),
          outcome: 'retryable_failure',
          failure_retryable: 1,
        }),
      ]);
    });
  }
  for (const reason of ['not due', 'running', 'foreign identity']) {
    it(`rejects claim ${reason} with no writes`, async () => {
      if (reason === 'not due')
        await db.execute('UPDATE scheduled_invocations SET run_at = ? WHERE id = ?', [
          iso(now + 1000),
          'inv',
        ]);
      if (reason === 'running') await seedRunning();
      const before = await stored();
      const beforeAttempts = await attempts();
      await expect(
        repo.claimAndStart({
          ...claimInput,
          identityId: reason === 'foreign identity' ? 'foreign' : 'identity',
        }),
      ).resolves.toBeNull();
      expect(await stored()).toEqual(before);
      expect(await attempts()).toEqual(beforeAttempts);
    });
  }
  for (const mismatch of ['claimToken', 'fencingToken'] as const) {
    it(`rejects completion with wrong ${mismatch} and no writes`, async () => {
      await seedRunning();
      const before = await stored();
      const beforeAttempts = await attempts();
      await expect(
        repo.completeAttempt({
          ...completeInput,
          [mismatch]: mismatch === 'claimToken' ? 'wrong' : 2,
        }),
      ).resolves.toBe(false);
      expect(await stored()).toEqual(before);
      expect(await attempts()).toEqual(beforeAttempts);
    });
  }
  it('throws the original error for an already finished attempt and rolls back', async () => {
    await seedRunning();
    await db.execute(`UPDATE invocation_attempts SET finished_at = ? WHERE id = 'attempt'`, [
      iso(now - 1),
    ]);
    const before = await stored();
    const beforeAttempts = await attempts();
    await expect(repo.completeAttempt(completeInput)).rejects.toThrow(
      new Error('Invocation attempt completion failed after state CAS.'),
    );
    expect(await stored()).toEqual(before);
    expect(await attempts()).toEqual(beforeAttempts);
  });
  for (const exhausted of [false, true]) {
    it(`recovers expired claim, retries exhausted ${exhausted}`, async () => {
      await seedRunning();
      if (exhausted)
        await db.execute(`UPDATE scheduled_invocations SET attempt_count = 3 WHERE id = 'inv'`);
      await expect(repo.recoverExpiredClaims(now)).resolves.toBe(1);
      expect(await stored()).toMatchObject({
        status: exhausted ? 'dead_letter' : 'retry_wait',
        next_attempt_at: exhausted ? null : iso(now),
        claim_token: null,
        claim_expires_at: null,
      });
    });
  }
  it('does not recover an unexpired running claim', async () => {
    await seedRunning();
    await db.execute(`UPDATE scheduled_invocations SET claim_expires_at = ? WHERE id = 'inv'`, [
      iso(now + 1),
    ]);
    const before = await stored();
    await expect(repo.recoverExpiredClaims(now)).resolves.toBe(0);
    expect(await stored()).toEqual(before);
  });
  it('locks down save update and supersede read-based counts', async () => {
    const original = await repo.findById('inv');
    if (!original) throw new Error('seed missing');
    await db.execute(
      `INSERT INTO scheduled_invocations (id, identity_id, owner_type, owner_id, scheduling_key, status) VALUES ('second', 'identity', 'task', 'owner', 'second', 'pending')`,
    );
    await repo.save({
      ...original,
      observability: { name: 'saved', tags: [] },
    });
    expect(await stored()).toMatchObject({ name: 'saved' });
    await expect(
      repo.supersedeStale({ identityId: 'identity', type: 'task', id: 'owner' }, ['key']),
    ).resolves.toBe(1);
    expect(await repo.findById('second')).toMatchObject({
      status: 'superseded',
    });
    await expect(
      repo.supersedeStale({ identityId: 'identity', type: 'task', id: 'owner' }, ['key']),
    ).resolves.toBe(0);
  });
  it('locks down attempt append and read success without execute-result checks', async () => {
    await seedRunning();
    const attemptRepo = new PowerSyncInvocationAttemptRepository(db);
    const original = await attemptRepo.findByIdForIdentity('identity', 'attempt');
    if (!original) throw new Error('attempt missing');
    await attemptRepo.append({ ...original, id: 'second', attemptNumber: 2 });
    expect(await attemptRepo.listForInvocation('identity', 'inv')).toHaveLength(2);
    expect(await attemptRepo.findLatestForInvocation('identity', 'inv')).toMatchObject({
      id: 'second',
      attemptNumber: 2,
    });
  });
  it('proves schedule_leases is a real table and preserves renewal ownership', async () => {
    const lease = createScheduleLeasePowerSyncRepository(db);
    const request = {
      leaseKey: 'lease',
      ownerToken: 'owner',
      now,
      expiresAt: now + 1000,
    };
    await expect(lease.tryAcquire(request)).resolves.toBe(true);
    await expect(
      db.get(`SELECT type FROM sqlite_master WHERE name = 'schedule_leases'`),
    ).resolves.toEqual({ type: 'table' });
    await expect(lease.renew({ ...request, expiresAt: now + 2000 })).resolves.toBe(true);
    await expect(lease.renew({ ...request, ownerToken: 'wrong' })).resolves.toBe(false);
  });
});
