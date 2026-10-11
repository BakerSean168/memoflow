import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { IElectronDatabase } from '@memoflow/contracts/electron';

export function createLocalAgentSqlite(): IElectronDatabase & { close(): void } {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`
    CREATE TABLE ai_agent_native_mappings (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, connection_id TEXT NOT NULL, instance_id TEXT NOT NULL);
    CREATE TABLE ai_agent_model_service_migrations (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, connection_id TEXT NOT NULL);
    CREATE TABLE ai_agent_instances (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, record_json TEXT NOT NULL);
    CREATE TABLE ai_agent_instance_bindings (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, instance_id TEXT NOT NULL, connection_id TEXT NOT NULL, record_json TEXT NOT NULL);
    CREATE TABLE ai_agent_conversation_bindings (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, conversation_id TEXT NOT NULL, instance_id TEXT NOT NULL, provider_id TEXT, model_id TEXT);
    CREATE TABLE ai_provider_configs (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, name TEXT, version INTEGER NOT NULL DEFAULT 1, is_default INTEGER NOT NULL DEFAULT 0, default_model TEXT, available_models TEXT, deleted_at TEXT, is_active INTEGER NOT NULL DEFAULT 1);
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
