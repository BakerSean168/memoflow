import Database from 'better-sqlite3';
import type { IElectronDatabase } from '@memoflow/contracts/electron';

function bind(parameters: unknown[] = []): (string | number | bigint | Buffer | null)[] {
  return parameters.map((value) => {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'bigint' ||
      Buffer.isBuffer(value)
    )
      return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    throw new Error('INVALID_SQLITE_PARAMETER');
  });
}

/** One read transaction, including uncheckpointed WAL, without opening a runtime. */
export async function readProfileSqliteSnapshot<T>(
  filename: string,
  read: (db: IElectronDatabase) => Promise<T>,
): Promise<T> {
  const connection = new Database(filename, { readonly: true, fileMustExist: true });
  const rejectWrite = async (): Promise<never> => {
    throw new Error('READ_ONLY_SNAPSHOT');
  };
  const db: IElectronDatabase = {
    execute: rejectWrite,
    writeTransaction: rejectWrite,
    readTransaction: (callback) => callback(db),
    async getAll<R>(sql: string, parameters?: unknown[]) {
      return connection.prepare(sql).all(...bind(parameters)) as R[];
    },
    async getOptional<R>(sql: string, parameters?: unknown[]) {
      return (connection.prepare(sql).get(...bind(parameters)) as R | undefined) ?? null;
    },
    async get<R>(sql: string, parameters?: unknown[]) {
      const value = await db.getOptional<R>(sql, parameters);
      if (value === null) throw new Error('SQLITE_ROW_NOT_FOUND');
      return value;
    },
  };
  try {
    connection.pragma('query_only = ON');
    connection.exec('BEGIN');
    // Establish the snapshot before handing control to asynchronous owner code.
    connection.prepare('SELECT name FROM sqlite_master LIMIT 1').get();
    return await read(db);
  } finally {
    if (connection.inTransaction) connection.exec('ROLLBACK');
    connection.close();
  }
}
