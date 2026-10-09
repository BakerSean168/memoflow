import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';

/** Real SQLite using the published Profile schema, with serialized write transactions. */
export function createPowerSyncSqliteFixture(path = ':memory:') {
  const sql = new DatabaseSync(path);
  const quoted = (value: string) => `"${value.replace(/"/g, '""')}"`;
  for (const table of PowerSyncAppSchema.tables) {
    sql.exec(
      `CREATE TABLE IF NOT EXISTS ${quoted(table.name)} (id TEXT PRIMARY KEY, ${table.columns.map((column) => `${quoted(column.name)} ${column.type}`).join(', ')})`,
    );
  }
  const parameters = (values: unknown[] = []): SQLInputValue[] =>
    values.map((value) => {
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'bigint' ||
        value instanceof Uint8Array
      )
        return value;
      throw new Error('Unsupported SQLite parameter');
    });
  let tail = Promise.resolve();
  const tx: IElectronDatabaseTransaction = {
    async execute(query, values) {
      return { rowsAffected: Number(sql.prepare(query).run(...parameters(values)).changes) };
    },
    async getAll<T>(query: string, values?: unknown[]) {
      return sql.prepare(query).all(...parameters(values)) as T[];
    },
    async getOptional<T>(query: string, values?: unknown[]) {
      return (sql.prepare(query).get(...parameters(values)) ?? null) as T | null;
    },
    async get<T>(query: string, values?: unknown[]) {
      const row = sql.prepare(query).get(...parameters(values));
      if (!row) throw new Error('Row not found');
      return row as T;
    },
  };
  const db: IElectronDatabase = {
    ...tx,
    async writeTransaction(work) {
      const previous = tail;
      let unlock!: () => void;
      tail = new Promise((resolve) => {
        unlock = resolve;
      });
      await previous;
      sql.exec('BEGIN');
      try {
        const result = await work(tx);
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
  return { db, sql, close: () => sql.close() };
}
