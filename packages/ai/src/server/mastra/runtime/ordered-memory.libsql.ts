import type { MastraDBMessage } from '@mastra/core/agent';
import { MemoryLibSQL, type SqliteClient } from '@mastra/libsql';
import { nextHistoryTimestamp } from '../../../shared/history-order';

/** All engine and workflow writes enter here, including streaming upserts. */
export class OrderedMemoryLibSQL extends MemoryLibSQL {
  constructor(private readonly client: SqliteClient) {
    super({ client });
  }

  override async saveMessages({ messages }: { messages: MastraDBMessage[] }) {
    if (!messages.length) return { messages: [] };
    const tx = await this.client.transaction('write');
    const saved: MastraDBMessage[] = [];
    try {
      for (const message of messages) {
        if (!message.threadId || !message.resourceId) throw new Error('Message scope is required');
        const thread = (
          await tx.execute({
            sql: 'SELECT "resourceId" FROM mastra_threads WHERE id = ?',
            args: [message.threadId],
          })
        ).rows[0];
        if (!thread || thread.resourceId !== message.resourceId)
          throw new Error('Message thread is unavailable');
        const existing = (
          await tx.execute({
            sql: 'SELECT thread_id, "resourceId", "createdAt" FROM mastra_messages WHERE id = ?',
            args: [message.id],
          })
        ).rows[0];
        if (
          existing &&
          (existing.thread_id !== message.threadId || existing.resourceId !== message.resourceId)
        ) {
          throw new Error('Message scope cannot change');
        }
        const latest = (
          await tx.execute({
            sql: 'SELECT MAX("createdAt") AS latest FROM mastra_messages WHERE thread_id = ?',
            args: [message.threadId],
          })
        ).rows[0]?.latest;
        const createdAt = existing
          ? new Date(String(existing.createdAt))
          : new Date(
              nextHistoryTimestamp(
                message.createdAt.getTime(),
                latest == null ? null : new Date(String(latest)).getTime(),
              ),
            );
        await tx.execute({
          sql: `INSERT INTO mastra_messages (id, thread_id, content, role, type, "createdAt", "resourceId")
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET content=excluded.content, role=excluded.role, type=excluded.type`,
          args: [
            message.id,
            message.threadId,
            JSON.stringify(message.content),
            message.role,
            message.type ?? 'v2',
            createdAt.toISOString(),
            message.resourceId,
          ],
        });
        saved.push({ ...message, createdAt });
      }
      for (const threadId of new Set(messages.map((message) => message.threadId!))) {
        await tx.execute({
          sql: 'UPDATE mastra_threads SET "updatedAt" = ? WHERE id = ?',
          args: [new Date().toISOString(), threadId],
        });
      }
      await tx.commit();
      return { messages: saved };
    } catch (error) {
      if (!tx.closed) await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  }
}
