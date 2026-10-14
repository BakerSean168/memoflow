import type { MastraCompositeStore } from '@mastra/core/storage';
import { LibSQLStore, type SqliteClient } from '@mastra/libsql';
import { PostgresStore } from '@mastra/pg';
import { createClient } from '@libsql/client';
import { GoalWorkflowEventsLibSQL } from './goal-workflow-events.libsql';
import { registerGoalWorkflowEventSource } from './goal-workflow-events.registry';
import { GoalWorkflowEventsPostgres } from './goal-workflow-events.postgres';

class GoalEventPostgresStore extends PostgresStore {
  private readonly events: GoalWorkflowEventsPostgres;

  constructor(connectionString: string, schemaName: string) {
    super({ id: 'memoflow-ai', connectionString, schemaName });
    this.events = new GoalWorkflowEventsPostgres(this, schemaName);
    registerGoalWorkflowEventSource(this, this.events);
  }

  override async init(): Promise<void> {
    await super.init();
    await this.events.init();
  }

  override async close(): Promise<void> {
    await this.events.dispose();
    await super.close();
  }
}

/** Wake readers only after commits; the durable journal remains authoritative. */
function withCommitWake(client: SqliteClient, wake: () => void): SqliteClient {
  // A supplied client bypasses Mastra's single-connection gate. Keep source
  // reads/pruning and engine operations outside any open interactive transaction.
  let tail = Promise.resolve();
  const acquire = async () => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    return release;
  };
  return {
    get closed() { return client.closed; },
    get protocol() { return client.protocol; },
    async close() {
      const release = await acquire();
      try { await client.close(); } finally { release(); }
    },
    async execute(statement) {
      const release = await acquire();
      try {
        const result = await client.execute(statement);
        if (result.rowsAffected > 0) wake();
        return result;
      } finally { release(); }
    },
    async batch(statements, mode) {
      const release = await acquire();
      try {
        const results = await client.batch(statements, mode);
        if (results.some((result) => result.rowsAffected > 0)) wake();
        return results;
      } finally { release(); }
    },
    async transaction(mode) {
      const release = await acquire();
      let transaction;
      try { transaction = await client.transaction(mode); }
      catch (error) { release(); throw error; }
      let changed = false;
      return {
        get closed() { return transaction.closed; },
        close() { try { transaction.close(); } finally { release(); } },
        async rollback() { try { await transaction.rollback(); } finally { release(); } },
        async execute(statement) {
          const result = await transaction.execute(statement);
          changed ||= result.rowsAffected > 0;
          return result;
        },
        async commit() {
          await transaction.commit();
          release();
          if (changed) wake();
        },
      };
    },
  };
}

class GoalEventLibSQLStore extends LibSQLStore {
  private readonly events: GoalWorkflowEventsLibSQL;

  constructor(url: string) {
    const rawClient = createClient({ url, ...(url.startsWith('file:') || url.includes(':memory:') ? { timeout: 5000 } : {}) });
    const client = withCommitWake(rawClient, () => events.notify());
    const events = new GoalWorkflowEventsLibSQL(client);
    super({ id: 'memoflow-ai', client });
    this.events = events;
    registerGoalWorkflowEventSource(this, this.events);
  }

  override async init(): Promise<void> {
    await super.init();
    await this.events.init();
  }

  override async close(): Promise<void> {
    await this.events.dispose();
    await super.close();
  }
}

export type MastraStorageConfig =
  | { readonly kind: 'postgres'; readonly connectionString: string; readonly schemaName?: string }
  | { readonly kind: 'libsql'; readonly url: string };

export function createMastraStorage(config: MastraStorageConfig): MastraCompositeStore {
  if (config.kind === 'postgres') {
    return new GoalEventPostgresStore(config.connectionString, config.schemaName ?? 'mastra');
  }

  return new GoalEventLibSQLStore(config.url);
}
