export interface VnextUniqueConstraintQueryClient {
  query(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
}

interface UniqueConstraintSpec {
  readonly table: string;
  readonly columns: readonly string[];
  readonly indexName: string;
}

const EMPTY_TABLE_ADDABLE_TEXT_COLUMNS = new Set([
  'idempotency_key',
  'owner_type',
  'owner_id',
  'scheduling_key',
  'occurrence_key',
  'plan_id',
]);

const UNIQUE_CONSTRAINTS: readonly UniqueConstraintSpec[] = [
  { table: 'goals', columns: ['id', 'identity_id'], indexName: 'goals_id_identity_id_key' },
  {
    table: 'key_results',
    columns: ['id', 'identity_id'],
    indexName: 'key_results_id_identity_id_key',
  },
  {
    table: 'key_results',
    columns: ['id', 'goal_id', 'identity_id'],
    indexName: 'key_results_id_goal_id_identity_id_key',
  },
  {
    table: 'notifications',
    columns: ['identity_id', 'idempotency_key'],
    indexName: 'notifications_identity_id_idempotency_key_key',
  },
  {
    table: 'schedule_tasks',
    columns: ['identity_id', 'owner_type', 'owner_id', 'scheduling_key'],
    indexName: 'schedule_tasks_owner_scheduling_key_unique',
  },
  {
    table: 'task_occurrences',
    columns: ['plan_id', 'occurrence_key'],
    indexName: 'task_occurrences_plan_id_occurrence_key_key',
  },
  {
    table: 'task_plans',
    columns: ['id', 'identity_id'],
    indexName: 'task_plans_id_identity_id_key',
  },
] as const;

export interface VnextUniqueConstraintReport {
  created: string[];
  existing: string[];
  addedEmptyTableColumns: string[];
  skippedMissingTables: string[];
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier in vNext uniqueness guard: ${identifier}`);
  }
  return `"${identifier}"`;
}

function countFrom(row: Record<string, unknown> | undefined): number {
  const value = row?.count;
  const count = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Invalid duplicate count from vNext uniqueness guard');
  }
  return count;
}

/**
 * Prisma `db push` asks for `--accept-data-loss` whenever it adds a unique
 * constraint, even when the legacy table is empty. Production must never use a
 * global override for that warning. This pre-step checks the exact target keys
 * for duplicates and creates only the verified-safe indexes with Prisma's
 * canonical names. Missing tables/columns are left for Prisma to create.
 */
export async function prepareVnextUniqueConstraints(
  client: VnextUniqueConstraintQueryClient,
): Promise<VnextUniqueConstraintReport> {
  const report: VnextUniqueConstraintReport = {
    created: [],
    existing: [],
    addedEmptyTableColumns: [],
    skippedMissingTables: [],
  };

  for (const spec of UNIQUE_CONSTRAINTS) {
    const tableResult = await client.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [
      `public.${spec.table}`,
    ]);
    if (tableResult.rows[0]?.present !== true) {
      report.skippedMissingTables.push(spec.indexName);
      continue;
    }

    const tableShape = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = ANY($2::text[])`,
      [spec.table, spec.columns],
    );
    const availableColumns = new Set(tableShape.rows.map((row) => String(row.column_name)));
    const missingColumns = spec.columns.filter((column) => !availableColumns.has(column));
    if (missingColumns.length > 0) {
      const unsupported = missingColumns.filter(
        (column) => !EMPTY_TABLE_ADDABLE_TEXT_COLUMNS.has(column),
      );
      if (unsupported.length > 0) {
        throw new Error(
          `Cannot prepare ${spec.indexName}: unexpected missing column(s) ${unsupported.join(', ')}`,
        );
      }
      const rowCountResult = await client.query(
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(spec.table)}`,
      );
      const rowCount = countFrom(rowCountResult.rows[0]);
      if (rowCount > 0) {
        throw new Error(
          `Cannot add ${missingColumns.join(', ')} for ${spec.indexName}: ${spec.table} contains ${rowCount} row(s) and requires semantic backfill`,
        );
      }
      for (const column of missingColumns) {
        await client.query(
          `ALTER TABLE ${quoteIdentifier(spec.table)} ADD COLUMN ${quoteIdentifier(column)} TEXT`,
        );
        report.addedEmptyTableColumns.push(`${spec.table}.${column}`);
        availableColumns.add(column);
      }
    }

    const indexResult = await client.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [
      `public.${spec.indexName}`,
    ]);
    if (indexResult.rows[0]?.present === true) {
      report.existing.push(spec.indexName);
      continue;
    }

    const columns = spec.columns.map(quoteIdentifier);
    const duplicateResult = await client.query(`
      SELECT COUNT(*) AS count
      FROM (
        SELECT ${columns.join(', ')}
        FROM ${quoteIdentifier(spec.table)}
        WHERE ${columns.map((column) => `${column} IS NOT NULL`).join(' AND ')}
        GROUP BY ${columns.join(', ')}
        HAVING COUNT(*) > 1
      ) duplicate_key
    `);
    const duplicateCount = countFrom(duplicateResult.rows[0]);
    if (duplicateCount > 0) {
      throw new Error(
        `Cannot create ${spec.indexName}: found ${duplicateCount} duplicate key group(s)`,
      );
    }

    await client.query(
      `CREATE UNIQUE INDEX ${quoteIdentifier(spec.indexName)} ON ${quoteIdentifier(spec.table)} (${columns.join(', ')})`,
    );
    report.created.push(spec.indexName);
  }

  return report;
}
