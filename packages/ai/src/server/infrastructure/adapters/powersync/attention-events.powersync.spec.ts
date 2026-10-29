import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PowerSyncDatabase } from '@powersync/node';
import { expect, it, vi } from 'vitest';
import { AttentionEventsPowerSync } from './attention-events.powersync';
import { ConversationAttentionPowerSyncAdapter } from './ai-conversation-attention-powersync.adapter';
import { ASSISTANT_ATTENTION_LEASE_MS } from '../../../application/ports/conversation-attention.port';

it('commits native Attention and replay together, retaining business revision across acknowledgement and restart', async () => {
  const { PowerSyncAppSchema } = await import('@memoflow/powersync-schema');
  const root = await mkdtemp(path.join(tmpdir(), 'attention-events-'));
  const db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: path.join(root, 'profile.sqlite') },
  });
  const source = new AttentionEventsPowerSync(db);
  const owner = new ConversationAttentionPowerSyncAdapter(db, source);
  const identity = {
    identityId: 'owner',
    runtimeKind: 'local_agent' as const,
    conversationId: 'conversation',
  };
  try {
    await db.init();
    await source.init();
    await owner.transition({
      ...identity,
      runId: 'run',
      state: 'working',
      sequence: 1,
      occurredAt: Date.now(),
    });
    // Inspect the committed ledger before any read-side reconciliation can repair it.
    expect(await db.getAll('SELECT sequence FROM ai_attention_event_log')).toEqual([
      { sequence: 1 },
    ]);
    await owner.transition({
      ...identity,
      runId: 'run',
      state: 'done',
      sequence: 2,
      occurredAt: Date.now(),
    });
    expect(await owner.acknowledge({ ...identity, revision: 2 })).toBe(true);
    const events = await source.read('owner', 0);
    expect(
      events.map((event) => [event.sequence, event.resourceVersion, event.data.attention?.state]),
    ).toEqual([
      [1, 1, 'working'],
      [2, 2, 'done'],
      [3, 3, 'normal'],
    ]);
    expect(events[2].data.attention).toMatchObject({ revision: 2, seenRevision: 2 });
    expect(await source.read('foreign', 0)).toEqual([]);
    expect(await owner.acknowledge({ ...identity, revision: 99 })).toBe(false);
    await expect(
      db.writeTransaction(async (tx) => {
        await tx.execute(
          "UPDATE ai_conversation_attention SET state='failed' WHERE identity_id='owner'",
        );
        await source.capture(tx, 'owner', 'local_agent', 'conversation');
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await source.head('owner')).toEqual({ first: 1, last: 3 });
    const epoch = source.epoch;
    await source.dispose();
    const restarted = new AttentionEventsPowerSync(db);
    try {
      await restarted.init();
      expect(restarted.epoch).toBe(epoch);
      expect((await restarted.read('owner', 2))[0].resourceVersion).toBe(3);
      const restartedOwner = new ConversationAttentionPowerSyncAdapter(db, restarted);
      const wake = vi.fn();
      const unsubscribe = restarted.subscribe(wake);
      await restartedOwner.forget(identity);
      await vi.waitFor(() => expect(wake).toHaveBeenCalled());
      expect((await restarted.read('owner', 3))[0].data.attention).toBeNull();
      unsubscribe();
    } finally {
      await restarted.dispose();
    }
  } finally {
    await source.dispose();
    await db.close();
    await rm(root, { recursive: true, force: true });
  }
});

it('reacts to hydration and lease expiry without modifying the native execution state', async () => {
  const { PowerSyncAppSchema } = await import('@memoflow/powersync-schema');
  const root = await mkdtemp(path.join(tmpdir(), 'attention-expiry-'));
  const db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: path.join(root, 'profile.sqlite') },
  });
  const source = new AttentionEventsPowerSync(db);
  try {
    await db.init();
    await source.init();
    const wake = vi.fn();
    const unsubscribe = source.subscribe(wake);
    await db.execute(
      `INSERT INTO ai_conversation_attention(id,identity_id,runtime_kind,conversation_id,run_id,run_sequence,state,revision,seen_revision,run_started_at,updated_at)
      VALUES('hydrated','owner','builtin','thread','run',1,'working',1,0,?,?)`,
      [Date.now(), Date.now() - ASSISTANT_ATTENTION_LEASE_MS + 500],
    );
    await vi.waitFor(() => expect(wake).toHaveBeenCalled());
    expect((await source.read('owner', 0))[0].data.attention?.state).toBe('working');
    // A second row changes while LIMIT 1 still returns the first row.
    wake.mockClear();
    await db.execute(
      `INSERT INTO ai_conversation_attention(id,identity_id,runtime_kind,conversation_id,run_id,run_sequence,state,revision,seen_revision,run_started_at,updated_at)
      VALUES('second','owner','builtin','second-thread','second-run',1,'done',1,0,?,?)`,
      [Date.now(), Date.now()],
    );
    await vi.waitFor(() => expect(wake).toHaveBeenCalled(), { timeout: 800 });
    wake.mockClear();
    // The deadline timer must wake and persist the projection itself: no head/read polling.
    await vi.waitFor(() => expect(wake).toHaveBeenCalled(), { timeout: 2000 });
    await vi.waitFor(
      async () =>
        expect(
          await db.getAll(
            "SELECT resource_version,expired FROM ai_attention_event_states WHERE conversation_id='thread'",
          ),
        ).toEqual([{ resource_version: 2, expired: 1 }]),
      { timeout: 2000 },
    );
    expect(
      await db.getOptional(
        "SELECT state,revision FROM ai_conversation_attention WHERE id='hydrated'",
      ),
    ).toEqual({
      state: 'working',
      revision: 1,
    });
    expect(
      (await source.read('owner', 1)).find((event) => event.data.conversationId === 'thread')?.data
        .attention,
    ).toMatchObject({
      state: 'normal',
      revision: 1,
      resourceVersion: 2,
    });
    unsubscribe();
  } finally {
    await source.dispose();
    await db.close();
    await rm(root, { recursive: true, force: true });
  }
});
