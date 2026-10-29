import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PowerSyncDatabase } from '@powersync/node';
import { expect, it } from 'vitest';
import { ConversationEventsPowerSync } from './conversation-events.powersync';
import { PowerSyncAIConversationRepository } from './ai-conversation-powersync.repository';
import { AIConversation } from '../../../domain/aggregates/ai-conversation';

it('records native create, rename, activity and deletion atomically with monotonic server versions', async () => {
  const { PowerSyncAppSchema } = await import('@memoflow/powersync-schema');
  const root = await mkdtemp(path.join(tmpdir(), 'conversation-events-'));
  const db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: path.join(root, 'profile.sqlite') },
  });
  const identityId = '550e8400-e29b-41d4-a716-446655440000';
  const events = new ConversationEventsPowerSync(db);
  const repo = new PowerSyncAIConversationRepository(db, events);
  try {
    await db.init();
    const conversation = AIConversation.create({ identityId: identityId, name: 'Initial' });
    await repo.save(conversation);
    expect(await db.getAll('SELECT resource_version FROM ai_conversation_event_log')).toEqual([
      { resource_version: 1 },
    ]);
    conversation.rename('New title');
    await repo.save(conversation);
    await repo.recordActivity(identityId, String(conversation.id), Date.now() + 1000);
    await repo.recordActivity('foreign', String(conversation.id), Date.now() + 2000);
    const changes = await events.read(identityId, 0);
    expect(changes.map((change) => change.resourceVersion)).toEqual([1, 2, 3]);
    expect(changes[1].data.conversation?.name).toBe('New title');
    expect(await events.read('foreign', 0)).toEqual([]);
    await expect(
      db.writeTransaction(async (tx) => {
        await tx.execute("UPDATE ai_conversations SET name='rollback' WHERE id=?", [
          String(conversation.id),
        ]);
        await events.capture(tx, identityId, String(conversation.id));
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect((await events.snapshot(identityId, [String(conversation.id)]))[0]).toMatchObject({
      name: 'New title',
      resourceVersion: 3,
    });
    await repo.delete(identityId, String(conversation.id));
    expect(
      await db.getAll('SELECT resource_version FROM ai_conversation_event_log ORDER BY sequence'),
    ).toEqual([
      { resource_version: 1 },
      { resource_version: 2 },
      { resource_version: 3 },
      { resource_version: 4 },
    ]);
    expect((await events.read(identityId, 3))[0].data.conversation).toBeNull();
    expect(await events.snapshot(identityId, [String(conversation.id)])).toEqual([]);
    const epoch = events.epoch;
    const restarted = new ConversationEventsPowerSync(db);
    try {
      await restarted.init();
      expect(restarted.epoch).toBe(epoch);
      expect((await restarted.read(identityId, 3))[0].resourceVersion).toBe(4);
    } finally {
      await restarted.dispose();
    }
  } finally {
    await events.dispose();
    await db.close();
    await rm(root, { recursive: true, force: true });
  }
});
