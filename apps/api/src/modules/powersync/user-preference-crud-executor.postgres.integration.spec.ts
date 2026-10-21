import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@memoflow/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeCrudBatch } from './crud-executor';

// Opt-in, isolated schema: never touch existing account or preference data.
const sourceUrl = process.env.TEST_DATABASE_URL;
const schema = `preference_567_${randomUUID().replaceAll('-', '')}`;
const sql = new Client({ connectionString: sourceUrl });
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: sourceUrl }, { schema }),
});
const payload = {
  timeZone: 'Asia/Shanghai',
  dateStyle: 'medium',
  timeStyle: '24h',
  weekStartsOn: 1,
};
const put = (id: string, overrides: Record<string, unknown> = {}) => ({
  op: 'PUT' as const,
  type: 'user_preference_records',
  id,
  data: { namespace: 'regional', payload, revision: 1, ...overrides },
});
const upload = (identity: string, ...ops: ReturnType<typeof put>[]) =>
  executeCrudBatch(db, identity, [{ ops }]);

describe.skipIf(!sourceUrl)('preference uploads with real PostgreSQL/PrismaPg', () => {
  beforeAll(async () => {
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`CREATE TABLE "${schema}".user_preference_records (
      id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, namespace TEXT NOT NULL,
      payload JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL,
      UNIQUE(identity_id, namespace)
    )`);
  });
  afterAll(async () => {
    await db.$disconnect();
    await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sql.end();
  });

  it('keeps duplicate inserts healthy, replays canonical IDs and rolls back conflicts atomically', async () => {
    await upload('owner', put('canonical'));
    await expect(upload('owner', put('canonical'))).resolves.toMatchObject({ operationCount: 1 });
    await expect(upload('owner', put('optimistic'))).rejects.toMatchObject({
      name: 'PowerSyncPreferenceConflictError',
      reason: 'canonical_id_mismatch',
      canonicalId: 'canonical',
    });
    // A successful earlier operation in the same batch must not survive a conflict.
    await expect(
      upload(
        'owner',
        put('presentation', {
          namespace: 'presentation',
          payload: { theme: 'dark', language: 'zh-CN' },
        }),
        put('different', { payload: { ...payload, timeZone: 'UTC' } }),
      ),
    ).rejects.toMatchObject({ reason: 'revision_conflict' });
    expect(
      await db.userPreferenceRecord.findMany({ where: { identityId: 'owner' } }),
    ).toMatchObject([{ id: 'canonical', revision: 1, payload }]);
    expect(await db.userPreferenceRecord.count({ where: { identityId: 'owner' } })).toBe(1);
    await upload('other', put('other-canonical'));
    await expect(upload('foreign', put('canonical'))).rejects.toThrow(/no canonical row exists/);
    expect(await db.userPreferenceRecord.count({ where: { identityId: 'foreign' } })).toBe(0);
  });

  it('handles concurrent creates without an aborted transaction', async () => {
    const results = await Promise.allSettled([
      upload('race', put('race-a')),
      upload('race', put('race-b')),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { name: 'PowerSyncPreferenceConflictError', reason: 'canonical_id_mismatch' },
    });
    expect(await db.userPreferenceRecord.count({ where: { identityId: 'race' } })).toBe(1);
  });
});
