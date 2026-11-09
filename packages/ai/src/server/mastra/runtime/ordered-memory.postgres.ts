import type { MastraDBMessage } from '@mastra/core/agent';
import { MemoryPG, type PostgresStore } from '@mastra/pg';
import {
  saveMessagesWithInvariants,
  type MessageStoreTables,
  type SqlExecutor,
} from './message-store.postgres';

export class OrderedMemoryPostgres extends MemoryPG {
  private readonly tables: MessageStoreTables;

  constructor(
    private readonly db: PostgresStore['db'],
    schemaName: string,
  ) {
    super({ client: db, schemaName });
    const schema = `"${schemaName.replace(/"/g, '""')}"`;
    this.tables = {
      messages: `${schema}.mastra_messages`,
      threads: `${schema}.mastra_threads`,
    };
  }

  override async saveMessages({ messages }: { messages: MastraDBMessage[] }) {
    if (!messages.length) return { messages: [] };
    return this.db.tx(async (tx) => {
      const executor: SqlExecutor = {
        query: <T>(sql: string, params: readonly unknown[] = []) =>
          tx.any(sql, params as unknown[]) as Promise<T[]>,
        execute: async (sql: string, params: readonly unknown[] = []) => {
          await tx.none(sql, params as unknown[]);
          return 0;
        },
      };
      return saveMessagesWithInvariants(executor, this.tables, messages);
    });
  }
}
