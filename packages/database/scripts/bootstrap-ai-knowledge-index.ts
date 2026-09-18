import { Client } from 'pg';
import { loadWorkspaceEnv } from '../src/load-workspace-env';
// Residual 1019: sole errorMessage (local toErrorMessage dual retired).
import { errorMessage as toErrorMessage } from '@memoflow/utils/shared';

const KNOWLEDGE_INDEX_TABLE = 'ai_knowledge_index_entries';
const RETRIEVAL_VECTOR_INDEX = 'ai_knowledge_index_entries_retrieval_vector_ivfflat_idx';

type BootstrapReport = {
  databaseUrlConfigured: boolean;
  tableCreated: boolean;
  tableAlreadyPresent: boolean;
  pgvectorExtensionInstalled: boolean;
  retrievalVectorColumnPresent: boolean;
  retrievalVectorIndexPresent: boolean;
  warnings: string[];
};

function parseArgs(argv: string[]) {
  const flags = new Set(argv);
  return {
    json: flags.has('--json'),
    help: flags.has('--help') || flags.has('-h'),
  };
}

function printUsage(): void {
  console.log(`Usage: tsx ./scripts/bootstrap-ai-knowledge-index.ts [options]

Options:
  --json      Print the bootstrap report as JSON
  --help, -h  Show this help message
`);
}

function printReport(report: BootstrapReport, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(
    `Knowledge index table: ${report.tableCreated ? 'created' : report.tableAlreadyPresent ? 'already present' : 'not created'}`,
  );
  console.log(
    `pgvector extension: ${report.pgvectorExtensionInstalled ? 'installed' : 'unavailable'}`,
  );
  console.log(
    `retrieval_vector column: ${report.retrievalVectorColumnPresent ? 'present' : 'missing'}`,
  );
  console.log(
    `retrieval_vector index: ${report.retrievalVectorIndexPresent ? 'present' : 'missing'}`,
  );

  if (report.warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of report.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  loadWorkspaceEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for AI knowledge-index bootstrap.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const report: BootstrapReport = {
      databaseUrlConfigured: true,
      tableCreated: false,
      tableAlreadyPresent: false,
      pgvectorExtensionInstalled: false,
      retrievalVectorColumnPresent: false,
      retrievalVectorIndexPresent: false,
      warnings: [],
    };

    const tableExistsResult = await client.query<{ regclass: string | null }>(
      `SELECT to_regclass('public.${KNOWLEDGE_INDEX_TABLE}') AS regclass`,
    );
    report.tableAlreadyPresent = Boolean(tableExistsResult.rows[0]?.regclass);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "ai_knowledge_index_entries" (
        "id" TEXT NOT NULL,
        "identity_id" TEXT NOT NULL,
        "repository_id" TEXT NOT NULL,
        "knowledge_space_id" TEXT NOT NULL,
        "knowledge_document_id" TEXT NOT NULL,
        "source_path" TEXT NOT NULL,
        "title" TEXT,
        "mime_type" TEXT NOT NULL,
        "source_content_hash" TEXT NOT NULL,
        "source_version" TEXT,
        "status" TEXT NOT NULL,
        "summary" TEXT,
        "keywords" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "embedding" JSONB,
        "chunks" JSONB,
        "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "error" TEXT,
        "indexed_at" TIMESTAMP(3) NOT NULL,
        "last_requested_at" TIMESTAMP(3),
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deleted_at" TIMESTAMP(3),
        CONSTRAINT "ai_knowledge_index_entries_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "ai_knowledge_index_entries_knowledge_space_id_knowledge_document_id_key"
          UNIQUE ("knowledge_space_id", "knowledge_document_id"),
        CONSTRAINT "ai_knowledge_index_entries_identity_id_fkey"
          FOREIGN KEY ("identity_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await client.query(
      'CREATE INDEX IF NOT EXISTS "ai_knowledge_index_entries_identity_id_idx" ON "ai_knowledge_index_entries"("identity_id")',
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS "ai_knowledge_index_entries_repository_id_idx" ON "ai_knowledge_index_entries"("repository_id")',
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS "ai_knowledge_index_entries_knowledge_space_id_knowledge_document_id_idx" ON "ai_knowledge_index_entries"("knowledge_space_id", "knowledge_document_id")',
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS "ai_knowledge_index_entries_status_idx" ON "ai_knowledge_index_entries"("status")',
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS "ai_knowledge_index_entries_last_requested_at_idx" ON "ai_knowledge_index_entries"("last_requested_at")',
    );

    report.tableCreated = !report.tableAlreadyPresent;

    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      report.pgvectorExtensionInstalled = true;
    } catch (error) {
      report.warnings.push(
        `pgvector extension is unavailable in the current database image: ${toErrorMessage(error)}`,
      );
    }

    if (report.pgvectorExtensionInstalled) {
      await client.query(`
        ALTER TABLE "ai_knowledge_index_entries"
        ADD COLUMN IF NOT EXISTS "retrieval_vector" vector(48)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS "${RETRIEVAL_VECTOR_INDEX}"
        ON "ai_knowledge_index_entries"
        USING ivfflat ("retrieval_vector" vector_cosine_ops)
      `);
    }

    const columnResult = await client.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'retrieval_vector'
      `,
      [KNOWLEDGE_INDEX_TABLE],
    );
    report.retrievalVectorColumnPresent = columnResult.rowCount > 0;

    const indexResult = await client.query(
      `
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = $1 AND indexname = $2
      `,
      [KNOWLEDGE_INDEX_TABLE, RETRIEVAL_VECTOR_INDEX],
    );
    report.retrievalVectorIndexPresent = indexResult.rowCount > 0;

    printReport(report, options.json);
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(toErrorMessage(error));
  process.exitCode = 1;
});
