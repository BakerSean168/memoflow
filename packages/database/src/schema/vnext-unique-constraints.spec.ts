import { describe, expect, it, vi } from 'vitest';
import {
  prepareVnextUniqueConstraints,
  type VnextUniqueConstraintQueryClient,
} from './vnext-unique-constraints';

const SHAPE_COLUMNS = new Map<string, string[]>([
  ['goals', ['id', 'identity_id']],
  ['key_results', ['id', 'goal_id', 'identity_id']],
  ['notifications', ['identity_id', 'idempotency_key']],
  ['scheduled_invocations', ['identity_id', 'owner_type', 'owner_id', 'scheduling_key']],
  ['task_occurrences', ['plan_id', 'occurrence_key']],
  ['task_plans', ['id', 'identity_id']],
]);

function happyClient() {
  const created: string[] = [];
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    if (sql.includes('to_regclass')) {
      const name = String(values?.[0]).replace(/^public\./, '');
      return { rows: [{ present: SHAPE_COLUMNS.has(name) }], rowCount: 1 };
    }
    if (sql.includes('FROM information_schema.columns')) {
      const table = String(values?.[0]);
      return {
        rows: (SHAPE_COLUMNS.get(table) ?? []).map((column_name) => ({ column_name })),
        rowCount: SHAPE_COLUMNS.get(table)?.length ?? 0,
      };
    }
    if (sql.includes('duplicate_key')) return { rows: [{ count: '0' }], rowCount: 1 };
    if (sql.startsWith('CREATE UNIQUE INDEX')) {
      created.push(sql.replace(/\s+/g, ' ').trim());
      return { rows: [], rowCount: null };
    }
    return { rows: [], rowCount: null };
  });
  return { client: { query } as VnextUniqueConstraintQueryClient, created };
}

describe('prepareVnextUniqueConstraints', () => {
  it('creates the seven Prisma-canonical unique indexes only after duplicate checks', async () => {
    const fixture = happyClient();

    const report = await prepareVnextUniqueConstraints(fixture.client);

    expect(report.created).toHaveLength(7);
    expect(report.existing).toEqual([]);
    expect(report.addedEmptyTableColumns).toEqual([]);
    expect(report.skippedMissingTables).toEqual([]);
    expect(fixture.created).toHaveLength(7);
    expect(fixture.created).toContain(
      'CREATE UNIQUE INDEX "scheduled_invocations_owner_key_unique" ON "scheduled_invocations" ("identity_id", "owner_type", "owner_id", "scheduling_key")',
    );
  });

  it('adds a known missing unique-key column only when the legacy table is empty', async () => {
    const added: string[] = [];
    const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
      if (sql.includes('to_regclass')) {
        const name = String(values?.[0]).replace(/^public\./, '');
        return { rows: [{ present: SHAPE_COLUMNS.has(name) }], rowCount: 1 };
      }
      if (sql.includes('FROM information_schema.columns')) {
        const table = String(values?.[0]);
        const columns = SHAPE_COLUMNS.get(table) ?? [];
        return {
          rows: columns
            .filter((column) => !(table === 'task_occurrences' && column === 'occurrence_key'))
            .map((column_name) => ({ column_name })),
          rowCount: columns.length,
        };
      }
      if (sql === 'SELECT COUNT(*) AS count FROM "task_occurrences"') {
        return { rows: [{ count: '0' }], rowCount: 1 };
      }
      if (sql.startsWith('ALTER TABLE')) {
        added.push(sql.replace(/\s+/g, ' ').trim());
        return { rows: [], rowCount: null };
      }
      if (sql.includes('duplicate_key')) return { rows: [{ count: '0' }], rowCount: 1 };
      return { rows: [], rowCount: null };
    });

    const report = await prepareVnextUniqueConstraints({
      query,
    } as VnextUniqueConstraintQueryClient);

    expect(report.addedEmptyTableColumns).toEqual(['task_occurrences.occurrence_key']);
    expect(added).toContain('ALTER TABLE "task_occurrences" ADD COLUMN "occurrence_key" TEXT');
  });

  it('fails closed instead of inventing a backfill when a table with a missing key column has rows', async () => {
    const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
      if (sql.includes('to_regclass')) {
        const name = String(values?.[0]).replace(/^public\./, '');
        return { rows: [{ present: SHAPE_COLUMNS.has(name) }], rowCount: 1 };
      }
      if (sql.includes('FROM information_schema.columns')) {
        const table = String(values?.[0]);
        const columns = SHAPE_COLUMNS.get(table) ?? [];
        return {
          rows: columns
            .filter((column) => !(table === 'notifications' && column === 'idempotency_key'))
            .map((column_name) => ({ column_name })),
          rowCount: columns.length,
        };
      }
      if (sql === 'SELECT COUNT(*) AS count FROM "notifications"') {
        return { rows: [{ count: '1' }], rowCount: 1 };
      }
      if (sql.includes('duplicate_key')) return { rows: [{ count: '0' }], rowCount: 1 };
      return { rows: [], rowCount: null };
    });

    await expect(
      prepareVnextUniqueConstraints({ query } as VnextUniqueConstraintQueryClient),
    ).rejects.toThrow(/notifications contains 1 row.*semantic backfill/);
  });

  it('fails closed before creating a unique index when duplicates exist', async () => {
    const queries: string[] = [];
    const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
      queries.push(sql.replace(/\s+/g, ' ').trim());
      if (sql.includes('to_regclass')) {
        const name = String(values?.[0]).replace(/^public\./, '');
        return { rows: [{ present: SHAPE_COLUMNS.has(name) }], rowCount: 1 };
      }
      if (sql.includes('FROM information_schema.columns')) {
        const table = String(values?.[0]);
        return {
          rows: (SHAPE_COLUMNS.get(table) ?? []).map((column_name) => ({ column_name })),
          rowCount: SHAPE_COLUMNS.get(table)?.length ?? 0,
        };
      }
      if (sql.includes('duplicate_key')) return { rows: [{ count: '1' }], rowCount: 1 };
      return { rows: [], rowCount: null };
    });

    await expect(
      prepareVnextUniqueConstraints({ query } as VnextUniqueConstraintQueryClient),
    ).rejects.toThrow(/Cannot create goals_id_identity_id_key.*1 duplicate/);
    expect(queries.some((sql) => sql.startsWith('CREATE UNIQUE INDEX'))).toBe(false);
  });
});
