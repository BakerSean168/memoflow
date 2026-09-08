import { randomUUID } from 'node:crypto';

const MAX_LABEL_NAME_LENGTH = 50;

export interface SqlQueryResult<Row = Record<string, unknown>> {
  readonly rows: Row[];
  readonly rowCount?: number | null;
}

export interface SqlQueryable {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>;
}

export interface TaskSharedLabelMigrationReport {
  readonly taskTablePresent: boolean;
  readonly legacyTagsPresent: boolean;
  readonly legacyColorPresent: boolean;
  readonly tasksScanned: number;
  readonly labelsCreated: number;
  readonly assignmentsCreated: number;
  readonly columnsRetired: readonly string[];
}

export interface LegacyTaskTag {
  readonly name: string;
  readonly normalizedName: string;
}

/**
 * Mirrors the canonical Shared Label name rules from ADR-054 / @memoflow/label.
 * Kept local to the database migration so @memoflow/database does not depend on
 * the Label package (which itself depends on database infrastructure).
 */
export function normalizeLegacyTaskTag(raw: string): LegacyTaskTag {
  const name = raw.trim().normalize('NFKC');
  if (!name) throw new TypeError('Legacy Task tag must not be empty.');
  if (name.length > MAX_LABEL_NAME_LENGTH) {
    throw new TypeError(`Legacy Task tag must be at most ${MAX_LABEL_NAME_LENGTH} characters.`);
  }
  return { name, normalizedName: name.toLowerCase() };
}

export function parseLegacyTaskTags(raw: string | null): LegacyTaskTag[] {
  if (raw == null || raw.trim() === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new TypeError(
      `Legacy Task tags are not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string')) {
    throw new TypeError('Legacy Task tags must be a JSON array of strings.');
  }

  const unique = new Map<string, LegacyTaskTag>();
  for (const value of parsed) {
    const tag = normalizeLegacyTaskTag(value);
    if (!unique.has(tag.normalizedName)) unique.set(tag.normalizedName, tag);
  }
  return [...unique.values()];
}

async function hasTable(db: SqlQueryable, table: string): Promise<boolean> {
  const result = await db.query<{ present: boolean }>(
    'SELECT to_regclass($1) IS NOT NULL AS present',
    [`public.${table}`],
  );
  return result.rows[0]?.present === true;
}

async function hasColumn(db: SqlQueryable, table: string, column: string): Promise<boolean> {
  const result = await db.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS present`,
    [table, column],
  );
  return result.rows[0]?.present === true;
}

/**
 * Migration-less Prisma db-push pre-step for ADR-054 Task classification.
 *
 * The operation is deliberately narrow:
 * 1. migrate legacy Task string tags into the existing Shared Label registry;
 * 2. create identity-scoped TaskLabel assignments idempotently;
 * 3. only then retire TaskTemplate.tags and TaskTemplate.color.
 *
 * It does not enable Prisma --accept-data-loss, so unrelated destructive schema
 * changes remain fail-closed.
 */
export async function prepareTaskSharedLabelMigration(
  db: SqlQueryable,
  options: { readonly idFactory?: () => string } = {},
): Promise<TaskSharedLabelMigrationReport> {
  const idFactory = options.idFactory ?? randomUUID;
  const taskTablePresent = await hasTable(db, 'task_templates');
  if (!taskTablePresent) {
    return {
      taskTablePresent: false,
      legacyTagsPresent: false,
      legacyColorPresent: false,
      tasksScanned: 0,
      labelsCreated: 0,
      assignmentsCreated: 0,
      columnsRetired: [],
    };
  }

  const legacyTagsPresent = await hasColumn(db, 'task_templates', 'tags');
  const legacyColorPresent = await hasColumn(db, 'task_templates', 'color');
  if (!legacyTagsPresent && !legacyColorPresent) {
    return {
      taskTablePresent: true,
      legacyTagsPresent: false,
      legacyColorPresent: false,
      tasksScanned: 0,
      labelsCreated: 0,
      assignmentsCreated: 0,
      columnsRetired: [],
    };
  }

  await db.query('BEGIN');
  try {
    let tasksScanned = 0;
    let labelsCreated = 0;
    let assignmentsCreated = 0;

    if (legacyTagsPresent) {
      const labelTablePresent = await hasTable(db, 'labels');
      const assignmentTablePresent = await hasTable(db, 'task_labels');
      const tasks = await db.query<{ id: string; identity_id: string; tags: string | null }>(
        'SELECT id, identity_id, tags FROM task_templates WHERE tags IS NOT NULL ORDER BY identity_id, id',
      );
      tasksScanned = tasks.rows.length;

      const parsed = tasks.rows.map((task) => ({ ...task, tagsParsed: parseLegacyTaskTags(task.tags) }));
      const hasAnyTags = parsed.some((task) => task.tagsParsed.length > 0);
      if (hasAnyTags && (!labelTablePresent || !assignmentTablePresent)) {
        throw new Error(
          'Legacy Task tags contain data but Shared Label tables are unavailable; refusing to drop classification data.',
        );
      }

      for (const task of parsed) {
        for (const tag of task.tagsParsed) {
          let labelId: string | undefined;
          const existing = await db.query<{ id: string }>(
            'SELECT id FROM labels WHERE identity_id = $1 AND normalized_name = $2 LIMIT 1',
            [task.identity_id, tag.normalizedName],
          );
          labelId = existing.rows[0]?.id;
          if (!labelId) {
            labelId = idFactory();
            const inserted = await db.query<{ id: string }>(
              `INSERT INTO labels (id, identity_id, name, normalized_name, color, created_at, updated_at)
               VALUES ($1, $2, $3, $4, NULL, NOW(), NOW())
               ON CONFLICT (identity_id, normalized_name) DO NOTHING
               RETURNING id`,
              [labelId, task.identity_id, tag.name, tag.normalizedName],
            );
            if (inserted.rows[0]?.id) {
              labelsCreated += 1;
            } else {
              const raced = await db.query<{ id: string }>(
                'SELECT id FROM labels WHERE identity_id = $1 AND normalized_name = $2 LIMIT 1',
                [task.identity_id, tag.normalizedName],
              );
              labelId = raced.rows[0]?.id;
              if (!labelId) {
                throw new Error(`Shared Label create race did not converge for ${tag.normalizedName}.`);
              }
            }
          }

          const assignment = await db.query(
            `INSERT INTO task_labels (identity_id, task_template_id, label_id)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [task.identity_id, task.id, labelId],
          );
          assignmentsCreated += assignment.rowCount ?? 0;
        }
      }
    }

    const columnsRetired: string[] = [];
    if (legacyTagsPresent) {
      await db.query('ALTER TABLE task_templates DROP COLUMN tags');
      columnsRetired.push('tags');
    }
    if (legacyColorPresent) {
      await db.query('ALTER TABLE task_templates DROP COLUMN color');
      columnsRetired.push('color');
    }

    await db.query('COMMIT');
    return {
      taskTablePresent: true,
      legacyTagsPresent,
      legacyColorPresent,
      tasksScanned,
      labelsCreated,
      assignmentsCreated,
      columnsRetired,
    };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
