import { Client } from 'pg';
import { errorMessage as toErrorMessage } from '@memoflow/utils/shared';
import { loadWorkspaceEnv } from '../src/load-workspace-env';
import { prepareAccountSettingCutover } from '../src/schema/account-setting-cutover';

async function main(): Promise<void> {
  loadWorkspaceEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for Account/Setting cutover.');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await prepareAccountSettingCutover(client);
    console.log('Account/Setting canonical cutover: ready');
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(toErrorMessage(error));
  process.exitCode = 1;
});
