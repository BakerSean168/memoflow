import { describe, expect, it } from 'vitest';
import type { MastraDBMessage } from '@mastra/core/agent';
import {
  saveMessagesWithInvariants,
  writeMessagesBatchWithInvariants,
  type SqlExecutor,
} from './message-store.postgres';

interface StoredThread {
  id: string;
  resourceId: string;
  updatedAt?: Date;
}

interface StoredMessage {
  id: string;
  threadId: string;
  resourceId: string;
  content: string;
  role: string;
  type: string;
  createdAt: Date;
}

/** Minimal in-memory stand-in for the positional SQL the shared writer emits. */
class FakeSqlExecutor implements SqlExecutor {
  readonly threads = new Map<string, StoredThread>();
  readonly messages = new Map<string, StoredMessage>();

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    const values = params as unknown[];
    if (sql.includes('FOR UPDATE')) {
      const thread = this.threads.get(String(values[0]));
      return (thread ? [{ id: thread.id, resourceId: thread.resourceId }] : []) as T[];
    }
    if (sql.includes('id IN (SELECT jsonb_array_elements_text')) {
      const ids = JSON.parse(String(values[0])) as string[];
      return ids.flatMap((id) => {
        const message = this.messages.get(id);
        return message ? [this.messageRow(message)] : [];
      }) as T[];
    }
    if (sql.includes('SELECT thread_id') && sql.includes('WHERE id=$1')) {
      const message = this.messages.get(String(values[0]));
      return (message ? [this.messageRow(message)] : []) as T[];
    }
    if (sql.includes('MAX(')) {
      const threadId = String(values[0]);
      const latest = [...this.messages.values()]
        .filter((message) => message.threadId === threadId)
        .reduce<number | null>(
          (max, message) =>
            max === null || message.createdAt.getTime() > max ? message.createdAt.getTime() : max,
          null,
        );
      return [{ latest: latest === null ? null : new Date(latest) }] as T[];
    }
    if (sql.includes('jsonb_to_recordset')) {
      const rows = JSON.parse(String(values[0])) as Array<{
        id: string;
        thread_id: string;
        resourceId: string;
        content: string;
        role: string;
        type: string;
        createdAt: string;
      }>;
      const written: Array<{ written: number }> = [];
      for (const row of rows) {
        const existing = this.messages.get(row.id);
        if (
          existing &&
          (existing.threadId !== row.thread_id || existing.resourceId !== row.resourceId)
        ) {
          continue;
        }
        this.messages.set(row.id, {
          id: row.id,
          threadId: row.thread_id,
          resourceId: row.resourceId,
          content: row.content,
          role: row.role,
          type: row.type,
          createdAt: existing ? existing.createdAt : new Date(row.createdAt),
        });
        written.push({ written: 1 });
      }
      return written as T[];
    }
    if (sql.includes('INSERT INTO') && sql.includes('RETURNING')) {
      const [id, threadId, content, role, type, createdAt, , resourceId] = values.map(String);
      const existing = this.messages.get(id);
      if (existing && (existing.threadId !== threadId || existing.resourceId !== resourceId)) {
        return [];
      }
      const message: StoredMessage = {
        id,
        threadId,
        resourceId,
        content,
        role,
        type,
        createdAt: existing ? existing.createdAt : new Date(createdAt),
      };
      this.messages.set(id, message);
      return [{ createdAt: message.createdAt }] as T[];
    }
    throw new Error(`Unhandled query: ${sql}`);
  }

  async execute(sql: string, params: readonly unknown[] = []): Promise<number> {
    const values = params as unknown[];
    if (sql.includes('UPDATE') && sql.includes('"updatedAt"')) {
      const threadId = String(values[2]);
      const thread = this.threads.get(threadId);
      if (thread) this.threads.set(threadId, { ...thread, updatedAt: new Date(String(values[0])) });
      return 1;
    }
    throw new Error(`Unhandled execute: ${sql}`);
  }

  private messageRow(message: StoredMessage) {
    return {
      id: message.id,
      thread_id: message.threadId,
      resourceId: message.resourceId,
      content: message.content,
      role: message.role,
      type: message.type,
      createdAt: message.createdAt,
    };
  }
}

const tables = { messages: 'mastra.mastra_messages', threads: 'mastra.mastra_threads' };

function message(
  id: string,
  threadId: string,
  resourceId: string,
  requested: number,
  text = id,
): MastraDBMessage {
  return {
    id,
    threadId,
    resourceId,
    role: 'assistant',
    type: 'text',
    createdAt: new Date(requested),
    content: { format: 2, parts: [{ type: 'text', text }] },
  };
}

function batch(id: string, requested: number, content = id) {
  return { id, content, role: 'assistant', type: 'text', createdAt: requested };
}

describe('shared Postgres message write invariants', () => {
  it('rejects mismatched thread scopes and existing message scope changes', async () => {
    const executor = new FakeSqlExecutor();
    executor.threads.set('thread-1', { id: 'thread-1', resourceId: 'owner' });
    executor.threads.set('thread-2', { id: 'thread-2', resourceId: 'owner' });

    await expect(
      saveMessagesWithInvariants(executor, tables, [
        message('wrong-resource', 'thread-1', 'other-owner', 1),
      ]),
    ).rejects.toThrow('Message thread is unavailable');

    await saveMessagesWithInvariants(executor, tables, [
      message('existing', 'thread-1', 'owner', 1),
    ]);
    await expect(
      saveMessagesWithInvariants(executor, tables, [message('existing', 'thread-2', 'owner', 1)]),
    ).rejects.toThrow('Message scope cannot change');

    await expect(
      writeMessagesBatchWithInvariants(executor, tables, 'thread-1', 'other-owner', [
        batch('batch-wrong-resource', 1),
      ]),
    ).rejects.toThrow('Message thread is unavailable');

    await expect(
      writeMessagesBatchWithInvariants(executor, tables, 'thread-2', 'owner', [
        batch('existing', 1),
      ]),
    ).rejects.toThrow('Message scope cannot change');
  });

  it('keeps createdAt and scope on conflict while updating content', async () => {
    const executor = new FakeSqlExecutor();
    executor.threads.set('thread-1', { id: 'thread-1', resourceId: 'owner' });

    await saveMessagesWithInvariants(executor, tables, [
      message('conflict', 'thread-1', 'owner', 1_000, 'before'),
    ]);
    const original = executor.messages.get('conflict')!;

    await saveMessagesWithInvariants(executor, tables, [
      message('conflict', 'thread-1', 'owner', 1_000, 'after'),
    ]);

    const updated = executor.messages.get('conflict')!;
    expect(updated.createdAt).toEqual(original.createdAt);
    expect(updated.threadId).toBe('thread-1');
    expect(updated.resourceId).toBe('owner');
    expect(updated.content).toContain('after');
  });

  it('allocates a monotonic logical clock for new batch rows only', async () => {
    const executor = new FakeSqlExecutor();
    executor.threads.set('thread-1', { id: 'thread-1', resourceId: 'owner' });

    const first = await writeMessagesBatchWithInvariants(executor, tables, 'thread-1', 'owner', [
      batch('a', 5_000),
      batch('b', 5_000),
      batch('c', 1_000),
    ]);
    expect(first.messages.map(({ createdAt }) => createdAt.getTime())).toEqual([
      5_000, 5_001, 5_002,
    ]);

    const replay = await writeMessagesBatchWithInvariants(executor, tables, 'thread-1', 'owner', [
      batch('a', 9_000, 'changed'),
      batch('b', 9_000, 'changed'),
      batch('c', 9_000, 'changed'),
    ]);
    expect(replay.messages.map(({ createdAt }) => createdAt.getTime())).toEqual([
      5_000, 5_001, 5_002,
    ]);
    expect(executor.messages.get('a')?.content).toBe('changed');

    const next = await writeMessagesBatchWithInvariants(executor, tables, 'thread-1', 'owner', [
      batch('d', 1_000),
    ]);
    expect(next.messages[0]?.createdAt.getTime()).toBe(5_003);
  });
});
