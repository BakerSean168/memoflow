import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { IElectronDatabase } from '@memoflow/contracts/electron';

export function createLocalAgentSqlite(): IElectronDatabase & { close(): void } {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE ai_local_agent_connections (id TEXT PRIMARY KEY, identity_id TEXT, record_json TEXT);
    CREATE TABLE ai_local_conversations (id TEXT PRIMARY KEY, identity_id TEXT, record_json TEXT);
    CREATE TABLE ai_local_conversation_items (id TEXT PRIMARY KEY, identity_id TEXT, conversation_id TEXT, created_at INTEGER, record_json TEXT);
  `);
  const parameters = (values: unknown[] = []): SQLInputValue[] =>
    values.map((value) => {
      if (value === null || typeof value === 'string' || typeof value === 'number') return value;
      throw new Error('Unsupported SQLite fixture parameter');
    });
  const db: IElectronDatabase = {
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
      const result = await db.getOptional<T>(query, values);
      if (!result) throw new Error('Row not found');
      return result;
    },
    async writeTransaction(work) {
      sql.exec('BEGIN');
      try {
        const result = await work(db);
        sql.exec('COMMIT');
        return result;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return Object.assign(db, { close: () => sql.close() });
}
