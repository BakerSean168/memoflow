import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PowerSyncDatabase } from '@powersync/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PowerSyncLabelRepository } from './powersync-label.repository';

let db: PowerSyncDatabase;
let dbPath: string;
let repository: PowerSyncLabelRepository;

beforeEach(async () => {
  const { PowerSyncAppSchema } = await import('@memoflow/powersync-schema');
  dbPath = path.join(os.tmpdir(), `memoflow-label-${randomUUID()}.db`);
  db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: dbPath },
  });
  await db.waitForReady();
  expect(await db.get('SELECT type FROM sqlite_master WHERE name = ?', ['labels'])).toEqual({
    type: 'view',
  });
  repository = new PowerSyncLabelRepository(db);
});
afterEach(async () => {
  await db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
});

async function seed() {
  return repository.create({
    id: 'label',
    identityId: 'identity',
    name: 'Label',
    normalizedName: 'label',
    color: null,
    createdAt: Date.parse('2026-10-29T00:00:00.000Z'),
    updatedAt: Date.parse('2026-10-29T00:00:00.000Z'),
  });
}

describe('label deletes on real PowerSync views (#709)', () => {
  it('returns true for a created row and removes it', async () => {
    await seed();
    const result = await repository.delete('identity', 'label');
    expect(await repository.findById('identity', 'label')).toBeNull();
    expect(result).toBe(true);
  });
  it('returns false for an absent id and preserves stored rows', async () => {
    const record = await seed();
    expect(await repository.delete('identity', 'missing')).toBe(false);
    expect(await repository.findById('identity', 'label')).toEqual(record);
  });
  it('returns false for another identity and preserves the row', async () => {
    const record = await seed();
    expect(await repository.delete('foreign', 'label')).toBe(false);
    expect(await repository.findById('identity', 'label')).toEqual(record);
  });
  it('returns true then false when deleting the same row twice', async () => {
    await seed();
    const first = await repository.delete('identity', 'label');
    const second = await repository.delete('identity', 'label');
    expect(await repository.findById('identity', 'label')).toBeNull();
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
