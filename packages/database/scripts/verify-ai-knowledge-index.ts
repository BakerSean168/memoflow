import { Client } from 'pg';
import { loadWorkspaceEnv } from '../src/load-workspace-env';
// Residual 1019: sole errorMessage (local toErrorMessage dual retired).
import { errorMessage as toErrorMessage } from '@memoflow/utils/shared';

const KNOWLEDGE_INDEX_TABLE = 'ai_knowledge_index_entries';
const KNOWLEDGE_INDEX_SCHEMA = 'public';
const RETRIEVAL_INDEX_NAME = 'ai_knowledge_index_entries_retrieval_vector_ivfflat_idx';
const RETRIEVAL_VECTOR_DIMENSION = 48;
const REQUIRED_BASE_COLUMNS = [
  'id',
  'identity_id',
  'repository_id',
  'knowledge_space_id',
  'knowledge_document_id',
  'source_path',
  'mime_type',
  'source_content_hash',
  'source_version',
  'status',
  'keywords',
  'metadata',
  'indexed_at',
  'created_at',
  'updated_at',
  'deleted_at',
];

type CliOptions = {
  requirePgvector: boolean;
  json: boolean;
  help: boolean;
};

type SmokeReport = {
  databaseUrlConfigured: boolean;
  tableExists: boolean;
  missingBaseColumns: string[];
  pgvectorExtensionInstalled: boolean;
  retrievalVectorColumnExists: boolean;
  retrievalVectorIndexExists: boolean;
  vectorProbeSucceeded: boolean;
  vectorProbeError?: string;
  passed: boolean;
  failures: string[];
};

function parseArgs(argv: string[]): CliOptions {
  const flags = new Set(argv);
  return {
    requirePgvector: flags.has('--require-pgvector'),
    json: flags.has('--json'),
    help: flags.has('--help') || flags.has('-h'),
  };
}

function printUsage(): void {
  console.log(`Usage: tsx ./scripts/verify-ai-knowledge-index.ts [options]

Options:
  --require-pgvector   Fail when the optional pgvector column, index, or probe is unavailable
  --json               Print the smoke report as JSON
  --help, -h           Show this help message
`);
}

function buildVectorLiteral(): string {
  return `[${Array.from({ length: RETRIEVAL_VECTOR_DIMENSION }, () => 0).join(',')}]`;
}

function printReport(report: SmokeReport, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Knowledge index table: ${report.tableExists ? 'present' : 'missing'}`);
  console.log(
    `Base columns: ${
      report.missingBaseColumns.length === 0
        ? 'present'
        : `missing ${report.missingBaseColumns.join(', ')}`
    }`,
  );
  console.log(`pgvector extension: ${report.pgvectorExtensionInstalled ? 'installed' : 'missing'}`);
  console.log(
    `retrieval_vector column: ${report.retrievalVectorColumnExists ? 'present' : 'missing'}`,
  );
  console.log(
    `retrieval_vector index: ${report.retrievalVectorIndexExists ? 'present' : 'missing'}`,
  );
  console.log(
    `vector probe: ${
      report.vectorProbeSucceeded
        ? 'passed'
        : report.vectorProbeError
          ? `failed (${report.vectorProbeError})`
          : 'skipped'
    }`,
  );

  if (report.failures.length > 0) {
    console.error('Failures:');
    for (const failure of report.failures) {
      console.error(`- ${failure}`);
    }
  } else {
    console.log('Smoke check passed.');
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
    throw new Error(
      'DATABASE_URL is required for the AI knowledge-index smoke check. Load the normal workspace .env before running this command.',
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const report: SmokeReport = {
      databaseUrlConfigured: true,
      tableExists: false,
      missingBaseColumns: [],
      pgvectorExtensionInstalled: false,
      retrievalVectorColumnExists: false,
      retrievalVectorIndexExists: false,
      vectorProbeSucceeded: false,
      passed: false,
      failures: [],
    };

    const tableResult = await client.query<{ regclass: string | null }>(
      'SELECT to_regclass($1) AS regclass',
      [`${KNOWLEDGE_INDEX_SCHEMA}.${KNOWLEDGE_INDEX_TABLE}`],
    );
    report.tableExists = Boolean(tableResult.rows[0]?.regclass);

    if (!report.tableExists) {
      report.failures.push(
        `${KNOWLEDGE_INDEX_TABLE} is missing. For an unbaselined local dev database, run pnpm nx run database:prisma-push. For a migration-tracked database, run pnpm nx run database:prisma-migrate-deploy before relying on the Prisma knowledge-index path.`,
      );
      printReport(report, options.json);
      throw new Error(report.failures.join('\n'));
    }

    const columnResult = await client.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
      `,
      [KNOWLEDGE_INDEX_SCHEMA, KNOWLEDGE_INDEX_TABLE],
    );
    const columns = new Set(columnResult.rows.map((row) => row.column_name));
    report.missingBaseColumns = REQUIRED_BASE_COLUMNS.filter((column) => !columns.has(column));
    report.retrievalVectorColumnExists = columns.has('retrieval_vector');

    if (report.missingBaseColumns.length > 0) {
      report.failures.push(
        `Base AI knowledge-index columns are missing: ${report.missingBaseColumns.join(', ')}`,
      );
    }

    const extensionResult = await client.query('SELECT 1 FROM pg_extension WHERE extname = $1', [
      'vector',
    ]);
    report.pgvectorExtensionInstalled = extensionResult.rowCount > 0;

    const indexResult = await client.query(
      `
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = $1 AND tablename = $2 AND indexname = $3
      `,
      [KNOWLEDGE_INDEX_SCHEMA, KNOWLEDGE_INDEX_TABLE, RETRIEVAL_INDEX_NAME],
    );
    report.retrievalVectorIndexExists = indexResult.rowCount > 0;

    if (report.pgvectorExtensionInstalled && report.retrievalVectorColumnExists) {
      try {
        const zeroVector = buildVectorLiteral();
        await client.query('SELECT 1 - ($1::vector <=> $1::vector) AS similarity', [zeroVector]);
        report.vectorProbeSucceeded = true;
      } catch (error) {
        report.vectorProbeError = toErrorMessage(error);
      }
    }

    if (options.requirePgvector) {
      if (!report.pgvectorExtensionInstalled) {
        report.failures.push('pgvector extension is not installed.');
      }
      if (!report.retrievalVectorColumnExists) {
        report.failures.push('retrieval_vector column is missing from ai_knowledge_index_entries.');
      }
      if (!report.retrievalVectorIndexExists) {
        report.failures.push(`${RETRIEVAL_INDEX_NAME} is missing.`);
      }
      if (!report.vectorProbeSucceeded) {
        report.failures.push(
          report.vectorProbeError
            ? `Vector probe failed: ${report.vectorProbeError}`
            : 'Vector probe was skipped because pgvector prerequisites are incomplete.',
        );
      }
    }

    report.passed = report.failures.length === 0;
    printReport(report, options.json);

    if (!report.passed) {
      throw new Error(report.failures.join('\n'));
    }
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(toErrorMessage(error));
  process.exitCode = 1;
});
