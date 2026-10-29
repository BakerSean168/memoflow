import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PowerSyncDatabase } from '@powersync/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserPreferenceDocument } from '../../../preferences';
import { UserPreferencePowerSyncRepository } from './user-preference-powersync.repository';

let db: PowerSyncDatabase;
let dbPath: string;
let repository: UserPreferencePowerSyncRepository;
const now = Date.parse('2026-10-29T00:00:00.000Z');

function document(revision = 1, id = 'preference') {
  return UserPreferenceDocument.load({
    id,
    identityId: 'identity',
    namespace: 'regional',
    payload: {
      timeZone: 'Asia/Tokyo',
      dateStyle: 'medium',
      timeStyle: '24h',
      weekStartsOn: 1,
    },
    revision,
    createdAt: now,
    updatedAt: now + revision * 1000,
  });
}

beforeEach(async () => {
  const { PowerSyncAppSchema } = await import('@memoflow/powersync-schema');
  dbPath = path.join(os.tmpdir(), `memoflow-setting-${randomUUID()}.db`);
  db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: dbPath },
  });
  await db.waitForReady();
  // Stop before exercising repository writes if the runtime premise changes.
  expect(
    await db.get('SELECT type FROM sqlite_master WHERE name = ?', ['user_preference_records']),
  ).toEqual({ type: 'view' });
  repository = new UserPreferencePowerSyncRepository(db);
});

afterEach(async () => {
  await db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

async function seed() {
  await db.execute(
    `INSERT INTO user_preference_records
     (id, identity_id, namespace, payload, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      'winner',
      'identity',
      'regional',
      JSON.stringify(document().payload),
      1,
      new Date(now).toISOString(),
      new Date(now + 1000).toISOString(),
    ],
  );
}

describe('user preferences on real PowerSync views (#709)', () => {
  it('reports created for a fresh insert and persists the document', async () => {
    const fresh = document();
    await expect(repository.create(fresh)).resolves.toEqual({
      kind: 'created',
      document: fresh,
    });
    expect((await repository.find('identity', 'regional'))?.toResponse()).toEqual(
      fresh.toResponse(),
    );
  });

  it('reports updated for a matching CAS and persists revision + 1', async () => {
    await seed();
    const next = document(2, 'winner');
    await expect(repository.compareAndSwap(next, 1)).resolves.toEqual({
      kind: 'updated',
      document: next,
    });
    expect((await repository.find('identity', 'regional'))?.toResponse()).toEqual(
      next.toResponse(),
    );
  });

  it('returns the existing winner without overwriting it', async () => {
    await seed();
    const winner = await repository.find('identity', 'regional');
    await expect(repository.create(document())).resolves.toEqual({
      kind: 'exists',
      document: winner,
    });
    expect(await repository.find('identity', 'regional')).toEqual(winner);
  });

  it('returns conflict with latest for a stale revision without modifying it', async () => {
    await seed();
    const latest = await repository.find('identity', 'regional');
    await expect(repository.compareAndSwap(document(3), 2)).resolves.toEqual({
      kind: 'conflict',
      latest,
    });
    expect(await repository.find('identity', 'regional')).toEqual(latest);
  });

  it('returns missing for an absent CAS row', async () => {
    await expect(repository.compareAndSwap(document(2), 1)).resolves.toEqual({
      kind: 'missing',
    });
  });

  it('enforces create and CAS revision arithmetic before writing', async () => {
    await expect(repository.create(document(2))).rejects.toThrow(TypeError);
    await expect(repository.create(document(2))).rejects.toThrow(
      'New preference rows must start at revision 1, got 2',
    );
    for (const expected of [0, -1, 1.5, NaN]) {
      await expect(repository.compareAndSwap(document(2), expected)).rejects.toThrow(TypeError);
      await expect(repository.compareAndSwap(document(2), expected)).rejects.toThrow(
        `Invalid expected preference revision: ${String(expected)}`,
      );
    }
    await expect(repository.compareAndSwap(document(3), 1)).rejects.toThrow(TypeError);
    await expect(repository.compareAndSwap(document(3), 1)).rejects.toThrow(
      'Preference CAS must advance exactly one revision: expected 2, got 3',
    );
    expect(await repository.list('identity')).toEqual([]);
  });
});
