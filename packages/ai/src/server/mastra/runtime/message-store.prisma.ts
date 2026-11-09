import type { Prisma } from '@memoflow/database';
import {
  createdAtExpression,
  writeMessagesBatchWithInvariants,
  type BatchMessage,
  type MessageStoreTables,
  type SqlExecutor,
} from './message-store.postgres';

/** Prisma client or transaction: both expose unsafe positional SQL. */
export type AiMessageSqlClient = Pick<
  Prisma.TransactionClient,
  '$queryRawUnsafe' | '$executeRawUnsafe'
>;

export interface AiThreadInsert {
  readonly id: string;
  readonly resourceId: string;
  readonly title: string;
  /** Mastra thread metadata is always the empty object for imported threads. */
  readonly metadata: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface AiStoredThreadRow {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AiStoredMessageRow {
  readonly id: string;
  readonly role: string;
  readonly type: string;
  readonly content: string;
  readonly createdAt: Date;
}

/**
 * Raw-SQL access to the Mastra transcript tables. Read methods are shared by the
 * export reader and the commit-time readback; write methods delegate to the
 * shared invariants.
 */
export interface AiMessageStore {
  readThread(id: string): Promise<{ readonly id: string; readonly resourceId: string } | null>;
  insertThread(input: AiThreadInsert): Promise<void>;
  writeMessages(input: {
    readonly threadId: string;
    readonly resourceId: string;
    readonly messages: readonly BatchMessage[];
  }): Promise<number>;
  readThreadMessages(threadId: string): Promise<AiStoredMessageRow[]>;
  readConversationName(identityId: string, id: string): Promise<string | null>;
  listOwnedThreadIds(identityId: string): Promise<string[]>;
  listLiveThreads(identityId: string): Promise<AiStoredThreadRow[]>;
}

const TABLES: MessageStoreTables = {
  messages: 'mastra.mastra_messages',
  threads: 'mastra.mastra_threads',
};

const MESSAGE_CREATED_AT = createdAtExpression();

export function createAiMessageStore(client: AiMessageSqlClient): AiMessageStore {
  const executor: SqlExecutor = {
    query: <T>(sql: string, params: readonly unknown[] = []) =>
      client.$queryRawUnsafe<T[]>(sql, ...params),
    execute: (sql: string, params: readonly unknown[] = []) =>
      client.$executeRawUnsafe(sql, ...params),
  };

  return {
    async readThread(id) {
      const [row] = await executor.query<{ id: string; resourceId: string }>(
        `SELECT id, "resourceId" FROM ${TABLES.threads} WHERE id=$1`,
        [id],
      );
      return row ?? null;
    },

    async insertThread(input) {
      const createdAt = new Date(input.createdAt).toISOString();
      const updatedAt = new Date(input.updatedAt).toISOString();
      await executor.execute(
        `INSERT INTO ${TABLES.threads} (id, "resourceId", title, metadata, "createdAt", "createdAtZ", "updatedAt", "updatedAtZ")
          VALUES ($1,$2,$3,$4::jsonb,$5::timestamp,$5::timestamptz,$6::timestamp,$6::timestamptz)`,
        [input.id, input.resourceId, input.title, input.metadata, createdAt, updatedAt],
      );
    },

    async writeMessages({ threadId, resourceId, messages }) {
      const result = await writeMessagesBatchWithInvariants(
        executor,
        TABLES,
        threadId,
        resourceId,
        messages,
      );
      return result.written;
    },

    async readThreadMessages(threadId) {
      return executor.query<AiStoredMessageRow>(
        `SELECT id, role, type, content, ${MESSAGE_CREATED_AT} AS "createdAt"
          FROM ${TABLES.messages}
          WHERE thread_id=$1
          ORDER BY ${MESSAGE_CREATED_AT}, id`,
        [threadId],
      );
    },

    async readConversationName(identityId, id) {
      const [row] = await executor.query<{ name: string }>(
        `SELECT name FROM public.ai_conversations
          WHERE id=$1 AND identity_id=$2 AND deleted_at IS NULL`,
        [id, identityId],
      );
      return row?.name ?? null;
    },

    async listOwnedThreadIds(identityId) {
      const rows = await executor.query<{ id: string }>(
        `SELECT id FROM ${TABLES.threads} WHERE "resourceId"=$1 ORDER BY id`,
        [identityId],
      );
      return rows.map((row) => row.id);
    },

    // Thread rows project only columns present in every environment's schema;
    // name and timestamps are authoritative on the ai_conversations shell
    // (integration stub DDL only has id/resourceId).
    async listLiveThreads(identityId) {
      return executor.query<AiStoredThreadRow>(
        `SELECT t.id,
            c.created_at AS "createdAt",
            c.updated_at AS "updatedAt"
          FROM ${TABLES.threads} t
          JOIN public.ai_conversations c
            ON c.id = t.id AND c.identity_id = t."resourceId"
          WHERE t."resourceId"=$1 AND c.deleted_at IS NULL
          ORDER BY t.id`,
        [identityId],
      );
    },
  };
}
