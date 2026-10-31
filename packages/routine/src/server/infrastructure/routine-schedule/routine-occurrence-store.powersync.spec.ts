import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PowerSyncDatabase } from '@powersync/node';
import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import { LeaseFencingException } from '@memoflow/reliable-messaging-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PowerSyncRoutineOccurrenceStore } from './routine-occurrence-store.powersync';
import type { RoutineOccurrenceLease } from '../../domain/ports/routine-occurrence-store.port';

// #731: only a real PowerSync view reproduces the zero rowsAffected that dead-lettered
// every routine occurrence on the installed desktop app.
let db: PowerSyncDatabase;
let dbPath: string;
let store: PowerSyncRoutineOccurrenceStore;
const identityId = 'IdentityId_routine-occurrence-view';
const dueAt = Date.parse('2026-10-31T09:51:30.000Z');

beforeEach(async () => {
  const { PowerSyncAppSchema } = await import('@memoflow/powersync-schema');
  dbPath = path.join(os.tmpdir(), `memoflow-routine-occurrence-${randomUUID()}.db`);
  db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: dbPath },
  });
  await db.waitForReady();
  store = new PowerSyncRoutineOccurrenceStore(db as unknown as IElectronDatabase);
});
afterEach(async () => {
  await db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

function claim(): Promise<RoutineOccurrenceLease> {
  return store.claimOccurrence({
    identityId,
    routineId: 'routine-1',
    occurrenceKey: 'routine-1:elapsed:1',
    triggerKind: 'Elapsed',
    scheduledFor: dueAt,
    sourceRevision: 1,
    claimedAt: dueAt,
    leaseExpiresAt: dueAt + 30_000,
  });
}

function commit(lease: RoutineOccurrenceLease, overrides: Record<string, unknown> = {}) {
  return {
    occurrenceId: lease.occurrenceId,
    fencingToken: lease.fencingToken,
    ownerToken: lease.ownerToken,
    status: 'succeeded' as const,
    history: {
      routineId: 'routine-1',
      identityId,
      occurrenceKey: 'routine-1:elapsed:1',
      scheduledFor: dueAt,
      triggeredAt: dueAt + 20,
      result: 'success' as const,
      reason: null,
    },
    nextOccurrenceAt: null,
    ...overrides,
  };
}

const row = () =>
  db.get<Record<string, unknown>>('SELECT status, owner_token, attempt FROM routine_occurrences');

describe('PowerSyncRoutineOccurrenceStore on a real PowerSync view (#731)', () => {
  it('routine_occurrences is a view that reports zero affected rows', async () => {
    expect(
      await db.get(`SELECT type FROM sqlite_master WHERE name = 'routine_occurrences'`),
    ).toEqual({ type: 'view' });
  });

  it('completes the current claim even though the view reports zero rows', async () => {
    const lease = await claim();
    const receipt = await store.completeOccurrence(commit(lease));
    expect(receipt.status).toBe('succeeded');
    expect(await row()).toEqual({
      status: 'succeeded',
      owner_token: null,
      attempt: 2,
    });
  });

  it('completes inside the shared occurrence transaction', async () => {
    const lease = await claim();
    const receipt = await store.withOccurrenceTransaction((transaction) =>
      store.completeOccurrence(commit(lease), { transaction }),
    );
    expect(receipt.status).toBe('succeeded');
    expect((await row()).status).toBe('succeeded');
  });

  it.each([
    ['a stale owner token', { ownerToken: 'owner:stale' }],
    ['a stale fencing token', { fencingToken: 99 }],
  ])('rejects %s without mutation', async (_name, overrides) => {
    const lease = await claim();
    await expect(store.completeOccurrence(commit(lease, overrides))).rejects.toBeInstanceOf(
      LeaseFencingException,
    );
    expect(await row()).toEqual({
      status: 'running',
      owner_token: lease.ownerToken,
      attempt: 1,
    });
  });

  it('rejects a commit after the lease expired', async () => {
    const lease = await claim();
    const late = commit(lease);
    await expect(
      store.completeOccurrence({
        ...late,
        history: { ...late.history, triggeredAt: dueAt + 60_000 },
      }),
    ).rejects.toBeInstanceOf(LeaseFencingException);
    expect((await row()).status).toBe('running');
  });

  it('rejects a second commit of an already finalized occurrence', async () => {
    const lease = await claim();
    await store.completeOccurrence(commit(lease));
    await expect(store.completeOccurrence(commit(lease))).rejects.toBeInstanceOf(
      LeaseFencingException,
    );
  });
});
