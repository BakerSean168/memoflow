import { Client } from 'pg';
import { errorMessage as toErrorMessage } from '@memoflow/utils/shared';
import { loadWorkspaceEnv } from '../src/load-workspace-env';
import { prepareKnowledgeStableDocumentIdentityCutover } from '../src/schema/knowledge-stable-document-identity-cutover';

async function main(): Promise<void> {
  loadWorkspaceEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for Knowledge stable document identity cutover.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const report = await prepareKnowledgeStableDocumentIdentityCutover(client);
    console.log(
      !report.tablePresent
        ? 'Knowledge stable document identity cutover: absent'
        : report.stableIdColumnPresent
          ? 'Knowledge stable document identity cutover: current'
          : report.resetPerformed
            ? 'Knowledge stable document identity cutover: reset'
            : 'Knowledge stable document identity cutover: current',
    );
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(toErrorMessage(error));
  process.exitCode = 1;
});
