import Database from 'better-sqlite3';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/desktop-contracts';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';

/**
 * Real SQLite Profile schema for renderer specs.
 *
 * `node:sqlite` cannot be bundled into the happy-dom test environment, so this
 * helper uses the native `better-sqlite3` module (externalized by Vitest) while
 * keeping the same schema and serialized write-transaction contract as the
 * shared fixture.
 */
export function createRendererSqliteFixture() {
  const sql = new Database(':memory:');
  const quoted = (value: string) => `"${value.replace(/"/g, '""')}"`;
  for (const table of PowerSyncAppSchema.tables) {
    sql.exec(
      `CREATE TABLE IF NOT EXISTS ${quoted(table.name)} (id TEXT PRIMARY KEY, ${table.columns
        .map((column) => `${quoted(column.name)} ${column.type}`)
        .join(', ')})`,
    );
  }

  let tail: Promise<void> = Promise.resolve();
  type SqlValue = string | number | bigint | null | Uint8Array;
  const parameters = (values: unknown[] = []): SqlValue[] =>
    values.map((value) => {
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'bigint' ||
        value instanceof Uint8Array
      )
        return value;
      throw new Error('Unsupported SQLite fixture parameter');
    });
  const run = (query: string, values: unknown[] = []) =>
    sql.prepare(query).run(...parameters(values));

  const transaction: IElectronDatabaseTransaction = {
    async execute(query, values) {
      return { rowsAffected: Number(run(query, values).changes) };
    },
    async getAll<T>(query: string, values?: unknown[]) {
      return sql.prepare(query).all(...parameters(values)) as T[];
    },
    async getOptional<T>(query: string, values?: unknown[]) {
      return (sql.prepare(query).get(...parameters(values)) ?? null) as T | null;
    },
    async get<T>(query: string, values?: unknown[]) {
      const result = await transaction.getOptional<T>(query, values);
      if (!result) throw new Error('Row not found');
      return result;
    },
  };

  const db: IElectronDatabase = {
    ...transaction,
    async writeTransaction(work) {
      const previous = tail;
      let unlock!: () => void;
      tail = new Promise((resolve) => {
        unlock = resolve;
      });
      await previous;
      sql.exec('BEGIN');
      try {
        const result = await work(transaction);
        sql.exec('COMMIT');
        return result;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      } finally {
        unlock();
      }
    },
  };

  return { db, close: () => sql.close() };
}
