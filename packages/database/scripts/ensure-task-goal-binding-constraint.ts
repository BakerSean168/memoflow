import { Client } from 'pg';
import { errorMessage as toErrorMessage } from '@memoflow/utils/shared';
import { loadWorkspaceEnv } from '../src/load-workspace-env';
import { ensureTaskGoalBindingConstraint } from '../src/schema/task-goal-binding-constraint';

async function main(): Promise<void> {
  loadWorkspaceEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for Task goal-binding setup.');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const report = await ensureTaskGoalBindingConstraint(client);
    const status = report.constraintReplaced
      ? 'replaced with canonical v2'
      : report.constraintCreated
        ? 'created canonical v2'
        : 'already canonical v2';
    console.log(
      report.tablePresent
        ? `Task goal-binding constraint: ${status}`
        : 'Task templates table is not present; constraint setup skipped.',
    );
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(toErrorMessage(error));
  process.exitCode = 1;
});
