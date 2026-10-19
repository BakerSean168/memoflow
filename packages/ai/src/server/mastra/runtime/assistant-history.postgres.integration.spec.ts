import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { MastraDBMessage } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import type { MastraCompositeStore } from '@mastra/core/storage';
import { getTestDatabaseUrl } from '@memoflow/test-utils/setup/database';
import { createMastraStorage } from './storage';
import { AssistantHistoryService } from './assistant-history.service';

async function closeStorage(storage: MastraCompositeStore) {
  await storage.close();
}

describe('Assistant history persisted logical clock', () => {
  it('persists same-ms turns, streaming positions and a regressing clock across restart', async () => {
    const schemaName = `mf_history_${randomUUID().replace(/-/g, '')}`;
    const config = {
      kind: 'postgres' as const,
      connectionString: getTestDatabaseUrl(),
      schemaName,
    };
    const storage = createMastraStorage(config);
    if (!(storage instanceof PostgresStore)) throw new Error('Postgres storage required');
    await storage.init();
    const memory = new Memory({ storage });
    const service = new AssistantHistoryService(memory, {
      async loadShell() {
        return { title: 'Order' };
      },
    });
    const scope = { identityId: 'owner', conversationId: 'thread' };
    const now = 1_800_000_000_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    try {
      const userId = await service.appendUserTurn({ ...scope, content: 'question' });
      const message = (id: string, text = id): MastraDBMessage => ({
        id,
        threadId: 'thread',
        resourceId: 'owner',
        role: 'assistant',
        createdAt: new Date(),
        content: { format: 2, parts: [{ type: 'text', text }] },
      });
      const answer = message('z-answer');
      const saved = await memory.saveMessages({ messages: [answer] });
      expect(saved.messages[0]?.createdAt.getTime()).toBe(now + 1);
      const ids = [userId, 'z-answer'];
      for (let index = 20; index > 0; index--) {
        const id = `turn-${String(index).padStart(2, '0')}`;
        await memory.saveMessages({ messages: [message(id)] });
        ids.push(id);
      }
      // Later stream chunks may carry the engine's original or a newer wall time.
      vi.setSystemTime(now + 5000);
      await memory.saveMessages({
        messages: [
          {
            ...answer,
            createdAt: new Date(),
            content: {
              format: 2,
              parts: [{ type: 'text', text: 'completed answer' }],
            },
          },
        ],
      });
      vi.setSystemTime(now - 5000);
      const lastUser = await service.appendUserTurn({ ...scope, content: 'clock moved back' });
      ids.push(lastUser);
      await memory.settled();
      const recalled = await memory.recall({ threadId: 'thread', perPage: false });
      expect(recalled.messages.map(({ id }) => id)).toEqual(ids);
      expect(recalled.messages.map(({ createdAt }) => createdAt.getTime())).toEqual(
        Array.from({ length: 23 }, (_, index) => now + index),
      );
      expect((await service.listMessages(scope)).messages.map(({ id }) => id)).toEqual(ids);
      expect((await service.listMessages(scope)).messages[1]?.content).toBe('completed answer');
      const reopened = createMastraStorage(config);
      try {
        await reopened.init();
        const restarted = new AssistantHistoryService(new Memory({ storage: reopened }), {
          async loadShell() {
            throw new Error('Persisted thread must be authoritative');
          },
        });
        expect((await restarted.listMessages(scope)).messages.map(({ id }) => id)).toEqual(ids);
      } finally {
        await closeStorage(reopened);
      }
    } finally {
      vi.useRealTimers();
      await storage.db.none(`DROP SCHEMA "${schemaName}" CASCADE`);
      await closeStorage(storage);
    }
  });
});

it('allocates batches and competing store writers atomically and rolls back scope collisions', async () => {
  const schemaName = `mf_history_${randomUUID().replace(/-/g, '')}`;
  const config = { kind: 'postgres' as const, connectionString: getTestDatabaseUrl(), schemaName };
  const first = createMastraStorage(config);
  const second = createMastraStorage(config);
  if (!(first instanceof PostgresStore)) throw new Error('Postgres storage required');

  await first.init();
  await second.init();
  const memory = new Memory({ storage: first });
  await memory.createThread({ threadId: 'thread', resourceId: 'owner' });
  await memory.createThread({ threadId: 'other', resourceId: 'owner' });
  const left = (await first.getStore('memory'))!;
  const right = (await second.getStore('memory'))!;
  const now = 1_800_000_000_000;
  const message = (id: string): MastraDBMessage => ({
    id,
    threadId: 'thread',
    resourceId: 'owner',
    role: 'assistant',
    createdAt: new Date(now),
    content: { format: 2, parts: [{ type: 'text', text: id }] },
  });
  try {
    await memory.createThread({ threadId: 'empty', resourceId: 'owner' });
    const empty = await Promise.all([
      left.saveMessages({ messages: [{ ...message('empty-z'), threadId: 'empty' }] }),
      right.saveMessages({ messages: [{ ...message('empty-a'), threadId: 'empty' }] }),
    ]);
    expect(
      empty.map(({ messages }) => messages[0]!.createdAt.getTime()).sort((a, b) => a - b),
    ).toEqual([now, now + 1]);
    const batch = Array.from({ length: 64 }, (_, index) => message(`batch-${64 - index}`));
    const result = await left.saveMessages({ messages: batch });
    expect(result.messages.map(({ createdAt }) => createdAt.getTime())).toEqual(
      Array.from({ length: 64 }, (_, index) => now + index),
    );
    const concurrent = await Promise.all([
      left.saveMessages({ messages: [message('writer-z')] }),
      right.saveMessages({ messages: [message('writer-a')] }),
    ]);
    expect(
      concurrent.map(({ messages }) => messages[0]!.createdAt.getTime()).sort((a, b) => a - b),
    ).toEqual([now + 64, now + 65]);
    await expect(
      left.saveMessages({
        messages: [
          message('rolled-back'),
          {
            ...message(batch[0]!.id),
            threadId: 'other',
          },
        ],
      }),
    ).rejects.toThrow('Message scope cannot change');
    const recalled = await memory.recall({ threadId: 'thread', perPage: false });
    expect(recalled.messages).toHaveLength(66);
    expect(recalled.messages.slice(0, 64).map(({ id }) => id)).toEqual(batch.map(({ id }) => id));
    expect(recalled.messages.some(({ id }) => id === 'rolled-back')).toBe(false);
    expect(
      (
        await left.saveMessages({ messages: [message('after-rollback')] })
      ).messages[0]?.createdAt.getTime(),
    ).toBe(now + 66);
  } finally {
    await first.db.none(`DROP SCHEMA "${schemaName}" CASCADE`);
    await closeStorage(second);
    await closeStorage(first);
  }
});
