import { Client } from 'pg';
import { errorMessage as toErrorMessage } from '@memoflow/utils/shared';
import { loadWorkspaceEnv } from '../src/load-workspace-env';
import { prepareGoalStartTimeframeSemantics } from '../src/schema/goal-start-timeframe-semantics';

async function main(): Promise<void> {
  loadWorkspaceEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for Goal start timeframe preparation.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const report = await prepareGoalStartTimeframeSemantics(client);
    if (!report.tablePresent) {
      console.log('Goals table is not present; Prisma will create Goal start timeframe storage.');
      return;
    }

    console.log(
      `Goal start timeframe semantics: ${report.columnAdded ? 'added start_kind; ' : ''}` +
        `backfilled ${report.rowsBackfilled} legacy row(s).`,
    );
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(toErrorMessage(error));
  process.exitCode = 1;
});
