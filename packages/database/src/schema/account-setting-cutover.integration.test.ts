import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { prepareAccountSettingCutover } from './account-setting-cutover';
import { prepareVnextUniqueConstraints } from './vnext-unique-constraints';

const databaseName = `memoflow_cutover_test_${randomUUID().replaceAll('-', '')}`;
const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl) throw new Error('TEST_DATABASE_URL is required');
const admin = new Client({ connectionString: sourceUrl });
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;
const db = new Client({ connectionString: testUrl.toString() });
let created = false;

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  await db.connect();
});
afterAll(async () => {
  await db.end();
  if (created) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await admin.end();
});
beforeEach(async () => {
  const result = await db.query('SELECT current_database() AS name');
  expect(result.rows[0]?.name).toBe(databaseName);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
});

async function legacyFixture(status = 'ACTIVE') {
  await db.query(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'ACTIVE', profile JSONB,
      settings JSONB, email_address TEXT, email_is_verified BOOLEAN,
      email_verified_at TIMESTAMP(3), email_is_primary BOOLEAN, version INTEGER,
      deleted_at TIMESTAMP(3), created_at TIMESTAMP(3), updated_at TIMESTAMP(3)
    );
    CREATE TABLE cloud_auth_users (
      id TEXT PRIMARY KEY, email TEXT, email_verified BOOLEAN,
      status TEXT DEFAULT 'active', disabled_at TIMESTAMP(3), updated_at TIMESTAMP(3)
    );
    CREATE TABLE user_settings (id TEXT PRIMARY KEY, preferences JSONB);
    INSERT INTO cloud_auth_users VALUES
      ('account-a', 'current@example.test', true, 'active', NULL, '2026-01-02'),
      ('disabled-user', 'disabled@example.test', false, 'disabled', NULL, '2026-01-03');
    INSERT INTO user_settings VALUES ('old-preferences', '{"legacy":true}');
  `);
  await db.query(
    `INSERT INTO accounts VALUES
    ('account-a', $1, '{"nickname":"Kept"}', '{"legacy":true}',
     'old-shadow@example.test', false, '2026-01-01', true, 4, NULL,
     '2026-01-01', '2026-01-02')`,
    [status],
  );
}

it('retires obsolete truth while preserving the account, current identity, and disabled access', async () => {
  await legacyFixture();
  await prepareAccountSettingCutover(db);
  expect((await db.query('SELECT id,status,profile FROM accounts')).rows).toEqual([
    { id: 'account-a', status: 'Active', profile: { nickname: 'Kept' } },
  ]);
  expect(
    (
      await db.query('SELECT email,email_verified,disabled_at FROM cloud_auth_users WHERE id=$1', [
        'account-a',
      ])
    ).rows[0],
  ).toEqual({ email: 'current@example.test', email_verified: true, disabled_at: null });
  expect(
    (
      await db.query('SELECT disabled_at::text AS disabled_at FROM cloud_auth_users WHERE id=$1', [
        'disabled-user',
      ])
    ).rows[0]?.disabled_at,
  ).toBe('2026-01-03 00:00:00');
  const columns = (
    await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts'",
    )
  ).rows.map((row) => row.column_name);
  for (const retired of ['settings', 'email_address', 'version'])
    expect(columns).not.toContain(retired);
  expect(
    (await db.query("SELECT to_regclass('public.user_settings') AS legacy")).rows[0]?.legacy,
  ).toBeNull();
  await prepareAccountSettingCutover(db);
  expect((await db.query('SELECT COUNT(*)::int AS count FROM accounts')).rows[0]?.count).toBe(1);
});

it('preserves closure time and disables cloud access for a retired inactive lifecycle', async () => {
  await legacyFixture('SUSPENDED');
  await db.query("UPDATE accounts SET deleted_at='2026-01-04'");
  await prepareAccountSettingCutover(db);
  expect(
    (await db.query('SELECT status,closed_at::text AS closed_at FROM accounts')).rows[0],
  ).toEqual({ status: 'Closed', closed_at: '2026-01-04 00:00:00' });
  expect(
    (
      await db.query('SELECT disabled_at::text AS disabled_at FROM cloud_auth_users WHERE id=$1', [
        'account-a',
      ])
    ).rows[0]?.disabled_at,
  ).toBe('2026-01-02 00:00:00');
});

it('fails closed and rolls back unknown account lifecycle values', async () => {
  await legacyFixture('unrecognized');
  await expect(prepareAccountSettingCutover(db)).rejects.toThrow(/unknown account lifecycle/i);
  expect((await db.query('SELECT status,settings FROM accounts')).rows[0]).toEqual({
    status: 'unrecognized',
    settings: { legacy: true },
  });
  expect((await db.query('SELECT COUNT(*)::int AS count FROM user_settings')).rows[0]?.count).toBe(
    1,
  );
});

it('supports an empty schema without inventing product facts', async () => {
  await prepareAccountSettingCutover(db);
  expect(
    (await db.query("SELECT COUNT(*)::int AS count FROM pg_tables WHERE schemaname='public'"))
      .rows[0]?.count,
  ).toBe(0);
});

it('bounds lock waiting and rolls back earlier schema changes', async () => {
  await legacyFixture();
  const blocker = new Client({ connectionString: testUrl.toString() });
  await blocker.connect();
  await blocker.query('BEGIN; LOCK TABLE cloud_auth_users IN ACCESS SHARE MODE');
  // Release a broken/unbounded implementation so the red regression can settle.
  const release = setTimeout(() => {
    void blocker.query('ROLLBACK');
  }, 10000);
  try {
    await expect(prepareAccountSettingCutover(db)).rejects.toThrow(/lock timeout/);
    expect((await db.query('SELECT status,settings FROM accounts')).rows[0]).toEqual({
      status: 'ACTIVE',
      settings: { legacy: true },
    });
    expect(
      (await db.query('SELECT COUNT(*)::int AS count FROM user_settings')).rows[0]?.count,
    ).toBe(1);
  } finally {
    clearTimeout(release);
    await blocker.query('ROLLBACK');
    await blocker.end();
  }
});

it.each(['', ', knowledge_space_id TEXT'])(
  'prepares missing AI Knowledge keys on an empty legacy table (%s)',
  async (existingColumns) => {
    await db.query(
      `CREATE TABLE ai_knowledge_index_entries (id TEXT PRIMARY KEY${existingColumns})`,
    );
    await prepareVnextUniqueConstraints(db);
    await db.query("INSERT INTO ai_knowledge_index_entries VALUES ('a','space','doc')");
    await expect(
      db.query("INSERT INTO ai_knowledge_index_entries VALUES ('b','space','doc')"),
    ).rejects.toThrow(/duplicate key/);
  },
);

it('rejects duplicate AI Knowledge keys before creating the unique index', async () => {
  await db.query(`CREATE TABLE ai_knowledge_index_entries (id TEXT PRIMARY KEY, knowledge_space_id TEXT, knowledge_document_id TEXT);
    INSERT INTO ai_knowledge_index_entries VALUES ('a','space','doc'),('b','space','doc')`);
  await expect(prepareVnextUniqueConstraints(db)).rejects.toThrow(/duplicate key group/);
  expect(
    (await db.query('SELECT COUNT(*)::int AS count FROM ai_knowledge_index_entries')).rows[0]
      ?.count,
  ).toBe(2);
});

it.each(['', ', knowledge_space_id TEXT'])(
  'refuses to invent AI Knowledge identity for a populated legacy index (%s)',
  async (existingColumns) => {
    await db.query(
      `CREATE TABLE ai_knowledge_index_entries (id TEXT PRIMARY KEY${existingColumns}); INSERT INTO ai_knowledge_index_entries (id) VALUES ('a')`,
    );
    const before = (await db.query('SELECT * FROM ai_knowledge_index_entries')).rows;
    await expect(prepareVnextUniqueConstraints(db)).rejects.toThrow(
      /contains 1 row.*semantic backfill/,
    );
    expect((await db.query('SELECT * FROM ai_knowledge_index_entries')).rows).toEqual(before);
  },
);
