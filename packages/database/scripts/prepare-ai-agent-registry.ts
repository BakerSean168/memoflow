import { Client } from 'pg';
import { errorMessage } from '@memoflow/utils/shared';
import { loadWorkspaceEnv } from '../src/load-workspace-env';
import { prepareAIAgentRegistry } from '../src/schema/ai-agent-registry';

async function main(): Promise<void> {
  loadWorkspaceEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for Agent Registry preparation');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await prepareAIAgentRegistry(client);
    console.log('Agent Registry V2 schema and legacy Mastra cutover: ready');
  } finally {
    await client.end();
  }
}
void main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
