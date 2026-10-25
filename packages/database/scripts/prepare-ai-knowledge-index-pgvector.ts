import { Client } from 'pg';
import { loadWorkspaceEnv } from '../src/load-workspace-env';
// Residual 1019: sole errorMessage (local toErrorMessage dual retired).
import { errorMessage as toErrorMessage } from '@memoflow/utils/shared';

async function main(): Promise<void> {
  loadWorkspaceEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to prepare pgvector.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    const result = await client.query<{ extversion: string }>(
      "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
    );
    const version = result.rows[0]?.extversion;
    if (!version) {
      throw new Error('pgvector extension was not installed.');
    }

    console.log(`pgvector extension: ready (${version})`);
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(toErrorMessage(error));
  process.exitCode = 1;
});
