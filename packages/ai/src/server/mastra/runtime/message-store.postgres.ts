import type { MastraDBMessage } from '@mastra/core/agent';
import { nextHistoryTimestamp } from '../../../shared/history-order';
import { requestedTimestamp, serializeContent } from './ordered-memory.shared';

/**
 * Positional-SQL seam shared by pg-promise (`OrderedMemoryPostgres`) and Prisma
 * transactions (`createAiMessageImportPort`).
 *
 * The scope guard, idempotent upsert and logical-clock allocation live here
 * exactly once so the runtime writer and the Profile import writer cannot drift.
 */
export interface SqlExecutor {
  query<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  execute(sql: string, params?: readonly unknown[]): Promise<number>;
}

export interface MessageStoreTables {
  readonly messages: string;
  readonly threads: string;
}

/** Structured content is serialized by `saveMessagesWithInvariants`; batch callers pass raw text. */
export interface BatchMessage {
  readonly id: string;
  readonly content: string;
  readonly role: string;
  readonly type: string;
  /** Requested wall-clock time in epoch milliseconds. */
  readonly createdAt: number;
}

export interface BatchWriteResult {
  readonly written: number;
  readonly messages: readonly { readonly id: string; readonly createdAt: Date }[];
}

interface ThreadScopeRow {
  readonly id: string;
  readonly resourceId: string;
}

interface ExistingMessageRow {
  readonly id: string;
  readonly thread_id: string;
  readonly resourceId: string;
  readonly createdAt: Date;
}

/** Matches the runtime writer's effective timestamp across both Mastra columns. */
export function timestampExpression(column: 'createdAt' | 'updatedAt', alias = ''): string {
  return `COALESCE(${alias}"${column}Z", ${alias}"${column}" AT TIME ZONE 'UTC')`;
}

export function createdAtExpression(alias = ''): string {
  return timestampExpression('createdAt', alias);
}

const CREATED_AT = createdAtExpression();

/**
 * Three write invariants, preserving the exact semantics of
 * `OrderedMemoryPostgres.saveMessages`:
 * 1. thread exists and owns every message's resource;
 * 2. existing messages may not change thread/resource, and their clock is kept;
 * 3. a first insert gets `max(requested, threadLatest + 1)`.
 */
export async function saveMessagesWithInvariants(
  executor: SqlExecutor,
  tables: MessageStoreTables,
  messages: readonly MastraDBMessage[],
): Promise<{ messages: MastraDBMessage[] }> {
  if (!messages.length) return { messages: [] };
  for (const message of messages) {
    if (!message.threadId || !message.resourceId) throw new Error('Message scope is required');
  }

  // Lock even an empty conversation; sorted acquisition prevents batch deadlocks.
  for (const threadId of [...new Set(messages.map((message) => message.threadId!))].sort()) {
    const [thread] = await executor.query<ThreadScopeRow>(
      `SELECT id, "resourceId" FROM ${tables.threads} WHERE id=$1 FOR UPDATE`,
      [threadId],
    );
    if (
      !thread ||
      messages.some(
        (message) => message.threadId === threadId && message.resourceId !== thread.resourceId,
      )
    ) {
      throw new Error('Message thread is unavailable');
    }
  }

  const saved: MastraDBMessage[] = [];
  for (const message of messages) {
    const [existing] = await executor.query<ExistingMessageRow>(
      `SELECT thread_id, "resourceId", ${CREATED_AT} AS "createdAt" FROM ${tables.messages} WHERE id=$1`,
      [message.id],
    );
    if (
      existing &&
      (existing.thread_id !== message.threadId || existing.resourceId !== message.resourceId)
    ) {
      throw new Error('Message scope cannot change');
    }
    const [latestRow] = await executor.query<{ latest: Date | null }>(
      `SELECT MAX(${CREATED_AT}) AS latest FROM ${tables.messages} WHERE thread_id=$1`,
      [message.threadId],
    );
    const createdAt =
      existing?.createdAt ??
      new Date(
        nextHistoryTimestamp(
          requestedTimestamp(message.createdAt),
          latestRow?.latest?.getTime() ?? null,
        ),
      );
    const [persisted] = await executor.query<{ createdAt: Date }>(
      `INSERT INTO ${tables.messages} AS current (id, thread_id, content, role, type, "createdAt", "createdAtZ", "resourceId")
        VALUES ($1,$2,$3,$4,$5,$6::timestamp,$7::timestamptz,$8)
        ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content, role=EXCLUDED.role, type=EXCLUDED.type
        WHERE current.thread_id=EXCLUDED.thread_id AND current."resourceId"=EXCLUDED."resourceId"
        RETURNING ${CREATED_AT} AS "createdAt"`,
      [
        message.id,
        message.threadId,
        serializeContent(message.content),
        message.role,
        message.type ?? 'v2',
        createdAt.toISOString(),
        createdAt.toISOString(),
        message.resourceId,
      ],
    );
    if (!persisted) throw new Error('Message scope cannot change');
    saved.push({ ...message, createdAt: persisted.createdAt });
  }

  await touchThreads(
    executor,
    tables,
    messages.map((message) => message.threadId!),
  );
  return { messages: saved };
}

/**
 * One statement per conversation for the tx-scoped import port.
 *
 * `INSERT ... SELECT FROM jsonb_to_recordset(...)` keeps the transaction budget
 * bounded while sharing the upsert predicate and clock semantics with the
 * single-message writer above.
 */
export async function writeMessagesBatchWithInvariants(
  executor: SqlExecutor,
  tables: MessageStoreTables,
  threadId: string,
  resourceId: string,
  messages: readonly BatchMessage[],
): Promise<BatchWriteResult> {
  if (!messages.length) return { written: 0, messages: [] };

  const ids = messages.map((message) => message.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate message id in batch');

  const [thread] = await executor.query<ThreadScopeRow>(
    `SELECT id, "resourceId" FROM ${tables.threads} WHERE id=$1 FOR UPDATE`,
    [threadId],
  );
  if (!thread || thread.resourceId !== resourceId) {
    throw new Error('Message thread is unavailable');
  }

  const existing = await executor.query<ExistingMessageRow>(
    `SELECT id, thread_id, "resourceId", ${CREATED_AT} AS "createdAt"
      FROM ${tables.messages}
      WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))`,
    [JSON.stringify(ids)],
  );
  const existingById = new Map(existing.map((row) => [row.id, row]));
  for (const row of existing) {
    if (row.thread_id !== threadId || row.resourceId !== resourceId) {
      throw new Error('Message scope cannot change');
    }
  }

  const [latestRow] = await executor.query<{ latest: Date | null }>(
    `SELECT MAX(${CREATED_AT}) AS latest FROM ${tables.messages} WHERE thread_id=$1`,
    [threadId],
  );
  let latest = latestRow?.latest?.getTime() ?? null;

  const rows = messages.map((message) => {
    const current = existingById.get(message.id);
    const createdAt =
      current?.createdAt.getTime() ?? nextHistoryTimestamp(message.createdAt, latest);
    if (!current) latest = createdAt;
    return {
      id: message.id,
      thread_id: threadId,
      content: message.content,
      role: message.role,
      type: message.type,
      createdAt: new Date(createdAt).toISOString(),
      resourceId,
    };
  });

  const written = await executor.query<{ written: number }>(
    `INSERT INTO ${tables.messages} AS current (id, thread_id, content, role, type, "createdAt", "createdAtZ", "resourceId")
      SELECT r.id, r.thread_id, r.content, r.role, r.type, r."createdAt"::timestamp, r."createdAt"::timestamptz, r."resourceId"
      FROM jsonb_to_recordset($1::jsonb) AS r(id text, thread_id text, content text, role text, type text, "createdAt" text, "resourceId" text)
      ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content, role=EXCLUDED.role, type=EXCLUDED.type
      WHERE current.thread_id=EXCLUDED.thread_id AND current."resourceId"=EXCLUDED."resourceId"
      RETURNING 1 AS written`,
    [JSON.stringify(rows)],
  );
  if (written.length !== messages.length) throw new Error('Message scope cannot change');

  await touchThreads(executor, tables, [threadId]);
  return {
    written: written.length,
    messages: rows.map((row) => ({ id: row.id, createdAt: new Date(row.createdAt) })),
  };
}

async function touchThreads(
  executor: SqlExecutor,
  tables: MessageStoreTables,
  threadIds: readonly string[],
): Promise<void> {
  for (const threadId of new Set(threadIds)) {
    const now = new Date().toISOString();
    await executor.execute(
      `UPDATE ${tables.threads} SET "updatedAt"=$1, "updatedAtZ"=$2 WHERE id=$3`,
      [now, now, threadId],
    );
  }
}
