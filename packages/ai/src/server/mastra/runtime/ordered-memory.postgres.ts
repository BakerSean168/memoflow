import type { MastraDBMessage } from '@mastra/core/agent';
import { MemoryPG, type PostgresStore } from '@mastra/pg';
import { nextHistoryTimestamp } from '../../../shared/history-order';
import { requestedTimestamp, serializeContent } from './ordered-memory.shared';

export class OrderedMemoryPostgres extends MemoryPG {
  private readonly messagesTable: string;
  private readonly threadsTable: string;

  constructor(
    private readonly db: PostgresStore['db'],
    schemaName: string,
  ) {
    super({ client: db, schemaName });
    const schema = `"${schemaName.replace(/"/g, '""')}"`;
    this.messagesTable = `${schema}.mastra_messages`;
    this.threadsTable = `${schema}.mastra_threads`;
  }

  override async saveMessages({ messages }: { messages: MastraDBMessage[] }) {
    if (!messages.length) return { messages: [] };
    for (const message of messages) {
      if (!message.threadId || !message.resourceId) throw new Error('Message scope is required');
    }
    return this.db.tx(async (tx) => {
      // Lock even an empty conversation; sorted acquisition prevents batch deadlocks.
      for (const threadId of [...new Set(messages.map((message) => message.threadId!))].sort()) {
        const thread = await tx.oneOrNone<{ id: string; resourceId: string }>(
          `SELECT id, "resourceId" FROM ${this.threadsTable} WHERE id=$1 FOR UPDATE`,
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
        const existing = await tx.oneOrNone<{
          thread_id: string;
          resourceId: string;
          createdAt: Date;
        }>(
          `SELECT thread_id, "resourceId", COALESCE("createdAtZ", "createdAt" AT TIME ZONE 'UTC') AS "createdAt" FROM ${this.messagesTable} WHERE id=$1`,
          [message.id],
        );
        if (
          existing &&
          (existing.thread_id !== message.threadId || existing.resourceId !== message.resourceId)
        ) {
          throw new Error('Message scope cannot change');
        }
        const { latest } = await tx.one<{ latest: Date | null }>(
          `SELECT MAX(COALESCE("createdAtZ", "createdAt" AT TIME ZONE 'UTC')) AS latest FROM ${this.messagesTable} WHERE thread_id=$1`,
          [message.threadId],
        );
        const createdAt =
          existing?.createdAt ??
          new Date(
            nextHistoryTimestamp(requestedTimestamp(message.createdAt), latest?.getTime() ?? null),
          );
        const persisted = await tx.oneOrNone<{ createdAt: Date }>(
          `INSERT INTO ${this.messagesTable} AS current (id, thread_id, content, role, type, "createdAt", "createdAtZ", "resourceId")
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content, role=EXCLUDED.role, type=EXCLUDED.type
            WHERE current.thread_id=EXCLUDED.thread_id AND current."resourceId"=EXCLUDED."resourceId"
            RETURNING COALESCE("createdAtZ", "createdAt" AT TIME ZONE 'UTC') AS "createdAt"`,
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
      for (const threadId of new Set(messages.map((message) => message.threadId!))) {
        await tx.none(
          `UPDATE ${this.threadsTable} SET "updatedAt"=$1, "updatedAtZ"=$2 WHERE id=$3`,
          [new Date().toISOString(), new Date().toISOString(), threadId],
        );
      }
      return { messages: saved };
    });
  }
}
