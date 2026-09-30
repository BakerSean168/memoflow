import { Client } from 'pg';
import { errorMessage } from '@memoflow/utils/shared';
import { prepareGoalRecordAuthorship } from '../src/schema/goal-record-authorship';
import { loadWorkspaceEnv } from '../src/load-workspace-env';

async function main(): Promise<void> {
  loadWorkspaceEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for GoalRecord authorship migration');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    if (!await prepareGoalRecordAuthorship(client)) return;
    console.log('GoalRecord authorship backfill and constraint applied');
  } finally {
    await client.end();
  }
}

void main().catch((cause) => {
  console.error(errorMessage(cause));
  process.exitCode = 1;
});
