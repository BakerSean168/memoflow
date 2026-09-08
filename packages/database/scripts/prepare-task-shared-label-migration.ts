import { Client } from 'pg';
import { errorMessage as toErrorMessage } from '@memoflow/utils/shared';
import { loadWorkspaceEnv } from '../src/load-workspace-env';
import { prepareTaskSharedLabelMigration } from '../src/schema/task-shared-label-migration';

async function main(): Promise<void> {
  loadWorkspaceEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for Task Shared Label migration preparation.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const report = await prepareTaskSharedLabelMigration(client);
    if (!report.taskTablePresent || report.columnsRetired.length === 0) {
      console.log('Task Shared Label migration: no legacy Task classification columns present.');
      return;
    }
    console.log(
      `Task Shared Label migration: ${report.tasksScanned} task(s) scanned; ` +
        `${report.labelsCreated} label(s) created; ${report.assignmentsCreated} assignment(s) created; ` +
        `retired ${report.columnsRetired.join(', ')}.`,
    );
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(toErrorMessage(error));
  process.exitCode = 1;
});
