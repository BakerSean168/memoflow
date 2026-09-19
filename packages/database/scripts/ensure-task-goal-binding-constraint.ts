import { Client } from 'pg';
import { errorMessage as toErrorMessage } from '@memoflow/utils/shared';
import { loadWorkspaceEnv } from '../src/load-workspace-env';
import {
  describeTaskGoalBindingConstraintReport,
  ensureTaskGoalBindingConstraint,
} from '../src/schema/task-goal-binding-constraint';

async function main(): Promise<void> {
  loadWorkspaceEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for Task goal-binding setup.');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const report = await ensureTaskGoalBindingConstraint(client);
    console.log(describeTaskGoalBindingConstraintReport(report));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(toErrorMessage(error));
  process.exitCode = 1;
});
