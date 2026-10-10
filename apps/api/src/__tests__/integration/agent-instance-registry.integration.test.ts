import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@memoflow/database';
import { AgentInstanceRegistry, createAIPrismaRepositories } from '@memoflow/ai';
import { afterAll, beforeAll, expect, it } from 'vitest';

const databaseName = `memoflow_agent_registry_integration_${randomUUID().replaceAll('-', '')}`;
const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl) throw new Error('TEST_DATABASE_URL is required');
const admin = new Client({ connectionString: sourceUrl });
const url = new URL(sourceUrl);
url.pathname = `/${databaseName}`;
const sql = new Client({ connectionString: url.toString() });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
const repository = createAIPrismaRepositories(prisma).agentInstanceRepository;
const registry = new AgentInstanceRegistry(repository, 'web');
let created = false;
beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  await sql.connect();
  await sql.query(`
    CREATE TABLE accounts (id TEXT PRIMARY KEY);
    CREATE TABLE ai_provider_configs (
      id TEXT PRIMARY KEY, identity_id TEXT NOT NULL REFERENCES accounts(id), name TEXT,
      credential_ref TEXT, default_model TEXT, available_models TEXT DEFAULT '[]',
      is_default BOOLEAN DEFAULT FALSE, is_active BOOLEAN DEFAULT TRUE, deleted_at TIMESTAMP(3)
    );
    CREATE TABLE ai_conversations (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL REFERENCES accounts(id));
    INSERT INTO accounts VALUES ('owner'), ('other');
    INSERT INTO ai_provider_configs (id,identity_id,name,credential_ref,default_model) VALUES ('provider','owner','Original','opaque-original-ref','model');
    INSERT INTO ai_conversations VALUES ('conversation','owner');
  `);
  await sql.query(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../../../../../packages/database/prisma/migrations/add-ai-agent-instance-registry.sql',
      ),
      'utf8',
    ),
  );
});
afterAll(async () => {
  await prisma.$disconnect();
  await sql.end();
  if (created) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

it('uses real Prisma transactions for Owner/CAS, concurrent claims, restart selection and deletion protection', async () => {
  for (const instanceId of ['mastra-one', 'mastra-two']) {
    await registry.execute('owner', {
      action: 'create',
      instance: {
        instanceId,
        driver: 'mastra',
        name: instanceId,
        accentColor: '#6469da',
        enabled: true,
      },
    });
    await registry.execute('owner', {
      action: 'bind',
      instanceId,
      expectedRevision: 1,
      connectionId: 'provider',
      modelId: 'model',
    });
  }
  await expect(
    registry.execute('other', {
      action: 'bind',
      instanceId: 'mastra',
      expectedRevision: 0,
      connectionId: 'provider',
      modelId: 'model',
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const saves = await Promise.allSettled(
    ['First', 'Second'].map((name) =>
      registry.execute('owner', {
        action: 'update',
        instanceId: 'mastra-one',
        expectedRevision: 2,
        patch: { name },
      }),
    ),
  );
  expect(saves.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const failedSave = saves.find((result) => result.status === 'rejected');
  expect(failedSave).toMatchObject({ reason: { code: 'CONFLICT' } });
  expect(
    (await registry.list('owner')).instances.find((row) => row.instanceId === 'mastra-one')
      ?.revision,
  ).toBe(3);
  const claims = await Promise.allSettled(
    ['mastra-one', 'mastra-two'].map((agentInstanceId) =>
      registry.assertTurnSelection({
        owner: 'owner',
        conversationId: 'conversation',
        agentInstanceId,
        providerId: 'provider',
        modelId: 'model',
      }),
    ),
  );
  expect(claims.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(claims.find((result) => result.status === 'rejected')).toMatchObject({
    reason: { code: 'CONFLICT' },
  });
  const agentInstanceId = claims[0]?.status === 'fulfilled' ? 'mastra-one' : 'mastra-two';
  const reloaded = new AgentInstanceRegistry(
    createAIPrismaRepositories(prisma).agentInstanceRepository,
    'web',
  );
  expect(
    await reloaded.execute('owner', {
      action: 'conversation_selection',
      conversationId: 'conversation',
    }),
  ).toEqual({ agentInstanceId, providerId: 'provider', modelId: 'model' });
  expect(
    await reloaded.execute('other', {
      action: 'conversation_selection',
      conversationId: 'conversation',
    }),
  ).toBeNull();
  await expect(
    reloaded.assertTurnSelection({ owner: 'owner', conversationId: 'conversation' }),
  ).rejects.toMatchObject({ code: 'AI_CONFIGURATION_REQUIRED' });
  await expect(
    repository.remove('owner', agentInstanceId, agentInstanceId === 'mastra-one' ? 3 : 2),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(
    (await sql.query('SELECT credential_ref,default_model FROM ai_provider_configs')).rows,
  ).toEqual([{ credential_ref: 'opaque-original-ref', default_model: 'model' }]);
});
