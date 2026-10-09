import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { composeBusinessDataSummary } from './compose-business-data-summary';

beforeAll(async () => {
  const db = await getPrisma();
  await db.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS mastra');
  for (const table of ['mastra_threads', 'mastra_messages', 'mastra_workflow_snapshot'])
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS mastra.${table} (id text PRIMARY KEY, "resourceId" text)`,
    );
});
beforeEach(cleanAll);
afterAll(disconnectPrisma);

it('considers custom account/preferences empty but counts archived and recoverable Goal facts', async () => {
  const db = await getPrisma();
  const account = await seedAccount();
  const other = await seedAccount();
  const summary = composeBusinessDataSummary(db);
  await db.userPreferenceRecord.create({
    data: {
      identityId: account.id,
      namespace: 'regional',
      payload: createDefaultUserPreferenceProfile().regional,
    },
  });
  expect((await summary(account.id)).state).toBe('empty');
  await db.goal.create({
    data: {
      id: 'archived',
      identityId: account.id,
      name: 'Archived',
      status: 'Completed',
      archivedAt: new Date(),
      deletedAt: new Date(),
    },
  });
  expect((await summary(account.id)).state).toBe('non_empty');
  expect((await summary(other.id)).state).toBe('empty');
});

it('counts Knowledge bindings even when the ten portable capabilities have no business records', async () => {
  const db = await getPrisma();
  const account = await seedAccount();
  await db.knowledgeSpace.create({ data: { id: 'space-summary' } });
  await db.knowledgeRemoteBinding.create({
    data: {
      id: 'binding-summary',
      knowledgeSpaceId: 'space-summary',
      identityId: account.id,
      installationId: 'installation',
      repositoryId: 'repository-summary',
      repositoryFullNameSnapshot: 'owner/repo',
      connectedAt: new Date(),
      disconnectedAt: new Date(),
    },
  });
  expect(await composeBusinessDataSummary(db)(account.id)).toMatchObject({
    state: 'non_empty',
    owners: expect.arrayContaining([{ owner: 'repository', state: 'non_empty' }]),
  });
});

it('counts Mastra message history with no conversation shell and keeps identities isolated', async () => {
  const db = await getPrisma();
  const account = await seedAccount();
  const other = await seedAccount();
  try {
    await db.$executeRaw`INSERT INTO mastra.mastra_messages (id, "resourceId") VALUES ('summary-message', ${account.id})`;
    expect((await composeBusinessDataSummary(db)(account.id)).state).toBe('non_empty');
    expect((await composeBusinessDataSummary(db)(other.id)).state).toBe('empty');
  } finally {
    await db.$executeRaw`DELETE FROM mastra.mastra_messages WHERE id = 'summary-message'`;
  }
});
