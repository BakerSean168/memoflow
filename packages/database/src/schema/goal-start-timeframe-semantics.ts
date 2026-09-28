export interface GoalStartTimeframeSchemaQueryClient {
  query(sql: string): Promise<{
    rows: Array<Record<string, unknown>>;
    rowCount: number | null;
  }>;
}

export interface GoalStartTimeframeSemanticsReport {
  tablePresent: boolean;
  columnAdded: boolean;
  rowsBackfilled: number;
}

/**
 * Prepares the Goal start precision discriminant before migration-less Prisma
 * `db push` deployments.
 *
 * Existing `start_date` values were exact Ymd values. They therefore have
 * day precision and must be backfilled as `start_kind = 'day'` before the
 * domain starts decoding Goal start as a reversible GoalTimeframe pair.
 */
export async function prepareGoalStartTimeframeSemantics(
  client: GoalStartTimeframeSchemaQueryClient,
): Promise<GoalStartTimeframeSemanticsReport> {
  const tableResult = await client.query(`SELECT to_regclass('public.goals') AS regclass`);
  if (!tableResult.rows[0]?.regclass) {
    return { tablePresent: false, columnAdded: false, rowsBackfilled: 0 };
  }

  await client.query('BEGIN');
  try {
    const beforeColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'goals'
        AND column_name = 'start_kind'
    `);
    const columnAlreadyPresent = beforeColumns.rows.length > 0;

    // PostgreSQL holds the ALTER TABLE lock until COMMIT, so no reader can
    // observe the new discriminator column before legacy rows are backfilled.
    await client.query(`
      ALTER TABLE goals
        ADD COLUMN IF NOT EXISTS start_kind TEXT
    `);

    const backfill = await client.query(`
      UPDATE goals
      SET start_kind = 'day'
      WHERE start_date IS NOT NULL
        AND start_kind IS NULL
      RETURNING id
    `);

    const invalid = await client.query(`
      SELECT id, start_kind, start_date
      FROM goals
      WHERE (start_kind IS NULL) <> (start_date IS NULL)
      LIMIT 1
    `);
    if (invalid.rows[0]) {
      const row = invalid.rows[0];
      throw new Error(
        `Goal start timeframe persistence is partial after backfill ` +
          `(id=${String(row.id)}, start_kind=${String(row.start_kind)}, start_date=${String(
            row.start_date,
          )}).`,
      );
    }

    await client.query('COMMIT');
    return {
      tablePresent: true,
      columnAdded: !columnAlreadyPresent,
      rowsBackfilled: backfill.rowCount ?? backfill.rows.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
