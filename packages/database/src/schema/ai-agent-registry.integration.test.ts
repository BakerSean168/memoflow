import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { prepareAIAgentRegistry } from './ai-agent-registry';

const databaseName = `memoflow_agent_registry_${randomUUID().replaceAll('-', '')}`;
const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl) throw new Error('TEST_DATABASE_URL is required');
const admin = new Client({ connectionString: sourceUrl });
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;
const db = new Client({ connectionString: testUrl.toString() });
let created = false;
const migration = readFileSync(
  new URL('../../prisma/migrations/add-ai-agent-instance-registry.sql', import.meta.url),
  'utf8',
);
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
  expect((await db.query('SELECT current_database() AS name')).rows[0]?.name).toBe(databaseName);
  await db.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    CREATE TABLE accounts (id TEXT PRIMARY KEY);
    CREATE TABLE ai_provider_configs (
      id TEXT PRIMARY KEY, identity_id TEXT NOT NULL REFERENCES accounts(id),
      name TEXT NOT NULL, credential_ref TEXT NOT NULL, default_model TEXT,
      available_models TEXT DEFAULT '[]', is_default BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE, deleted_at TIMESTAMP(3)
    );
    CREATE TABLE ai_conversations (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL REFERENCES accounts(id));
    CREATE TABLE ai_provider_secrets (id TEXT PRIMARY KEY, encrypted_value TEXT);
    INSERT INTO accounts VALUES ('a'), ('b'), ('empty');
    INSERT INTO ai_provider_configs (id, identity_id, name, credential_ref, default_model, is_default, is_active) VALUES
      ('default-a', 'a', 'Same name', 'secret-a', 'original-model', TRUE, TRUE),
      ('other-a', 'a', 'Same name', '', NULL, FALSE, FALSE),
      ('default-b', 'b', 'Same name', 'secret-b', 'model-b', TRUE, TRUE);
    INSERT INTO ai_conversations VALUES ('old-a', 'a'), ('old-b', 'b');
    INSERT INTO ai_provider_secrets VALUES ('secret-a', 'opaque-ciphertext');
  `);
});

it('backfills deterministically once, preserves provider/secret/history and does not resurrect removed instances', async () => {
  const before = (await db.query('SELECT * FROM ai_provider_configs ORDER BY id')).rows;
  await db.query(migration);
  await prepareAIAgentRegistry(db);
  expect(
    (
      await db.query(
        'SELECT identity_id,instance_id,name,enabled FROM ai_agent_instances ORDER BY identity_id,instance_id',
      )
    ).rows,
  ).toEqual([
    { identity_id: 'a', instance_id: 'mastra', name: 'Mastra', enabled: true },
    {
      identity_id: 'a',
      instance_id: 'mastra-legacy-c81ee457891b0f8b972ad5c4739d85a0',
      name: 'Same name',
      enabled: false,
    },
    { identity_id: 'b', instance_id: 'mastra', name: 'Mastra', enabled: true },
  ]);
  expect(
    (
      await db.query(
        'SELECT identity_id,instance_id,connection_id,model_id FROM ai_agent_instance_bindings ORDER BY identity_id',
      )
    ).rows,
  ).toEqual([
    {
      identity_id: 'a',
      instance_id: 'mastra',
      connection_id: 'default-a',
      model_id: 'original-model',
    },
    { identity_id: 'b', instance_id: 'mastra', connection_id: 'default-b', model_id: 'model-b' },
  ]);
  expect((await db.query('SELECT * FROM ai_provider_configs ORDER BY id')).rows).toEqual(before);
  expect((await db.query('SELECT * FROM ai_provider_secrets')).rows).toEqual([
    { id: 'secret-a', encrypted_value: 'opaque-ciphertext' },
  ]);
  expect((await db.query('SELECT * FROM ai_agent_conversation_bindings')).rows).toEqual([]);
  await db.query("DELETE FROM ai_agent_instances WHERE instance_id LIKE 'mastra-legacy-%'");
  await db.query(migration);
  await prepareAIAgentRegistry(db);
  expect(
    (await db.query("SELECT * FROM ai_agent_instances WHERE instance_id LIKE 'mastra-legacy-%'"))
      .rows,
  ).toEqual([]);
});

it('rejects cross-owner references and leaves no partial backfill or completion marker on failure', async () => {
  await db.query(migration);
  await db.query("UPDATE ai_provider_configs SET name = repeat('x', 121) WHERE id = 'other-a'");
  await expect(prepareAIAgentRegistry(db)).rejects.toThrow();
  expect((await db.query('SELECT * FROM ai_agent_instances')).rows).toEqual([]);
  expect((await db.query('SELECT * FROM ai_agent_registry_migrations')).rows).toEqual([]);
  await db.query("UPDATE ai_provider_configs SET name='Recovered' WHERE id='other-a'");
  await prepareAIAgentRegistry(db);
  await expect(
    db.query(
      "INSERT INTO ai_agent_instance_bindings VALUES ('bad', 'a', 'mastra', 'default-b', 'model-b')",
    ),
  ).rejects.toMatchObject({ code: '23503' });
  await expect(
    db.query(
      "INSERT INTO ai_agent_conversation_bindings (id,identity_id,conversation_id,instance_id) VALUES ('bad-chat', 'a', 'old-b', 'mastra')",
    ),
  ).rejects.toMatchObject({ code: '23503' });
  await expect(
    db.query("DELETE FROM ai_provider_configs WHERE id='default-a'"),
  ).rejects.toMatchObject({ code: '23001' });
});

it('supports additive schema rollback while preserving every legacy provider and conversation', async () => {
  await db.query(migration);
  await prepareAIAgentRegistry(db);
  await db.query(
    'DROP TABLE ai_agent_conversation_bindings, ai_agent_instance_bindings, ai_agent_instances, ai_agent_registry_migrations',
  );
  expect((await db.query('SELECT COUNT(*)::int AS n FROM ai_provider_configs')).rows[0]?.n).toBe(3);
  expect((await db.query('SELECT COUNT(*)::int AS n FROM ai_conversations')).rows[0]?.n).toBe(2);
  expect((await db.query('SELECT COUNT(*)::int AS n FROM ai_provider_secrets')).rows[0]?.n).toBe(1);
  await db.query(migration);
  await prepareAIAgentRegistry(db);
  expect((await db.query('SELECT COUNT(*)::int AS n FROM ai_agent_instances')).rows[0]?.n).toBe(3);
});
