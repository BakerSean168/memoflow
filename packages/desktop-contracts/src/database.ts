export interface IElectronDatabaseQueryResult {
  rowsAffected?: number;
}

export interface IElectronDatabaseTransaction {
  execute(sql: string, parameters?: unknown[]): Promise<IElectronDatabaseQueryResult>;
  getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]>;
  getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null>;
  get<T>(sql: string, parameters?: unknown[]): Promise<T>;
}

/**
 * Canonical desktop business database contract for Electron modules.
 *
 * This is intentionally structural so the contracts package does not depend on
 * the concrete PowerSync Node runtime package. Desktop main passes the actual
 * `@powersync/node` database instance, while modules depend only on the minimal
 * business operations they need.
 */
export interface IElectronDatabase extends IElectronDatabaseTransaction {
  /** Public reactive query capability supplied by the live Profile's PowerSync database. */
  watch?(
    sql: string,
    parameters?: unknown[],
    options?: {
      signal?: AbortSignal;
      comparator?: { checkEquality(current: unknown, previous: unknown): boolean };
    },
  ): AsyncIterable<{ rows?: { _array?: readonly Record<string, unknown>[] } }>;
  writeTransaction<T>(callback: (tx: IElectronDatabaseTransaction) => Promise<T>): Promise<T>;
  readTransaction?<T>(callback: (tx: IElectronDatabaseTransaction) => Promise<T>): Promise<T>;
}
