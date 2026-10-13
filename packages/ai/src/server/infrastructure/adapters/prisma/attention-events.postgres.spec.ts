import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { AttentionEventsPostgres } from './attention-events.postgres';

const connectionString =
  process.env.MEMOFLOW_WORKSPACE_EVENTS_PG_URL ?? process.env.MEMOFLOW_GOAL_EVENTS_PG_URL;

describe.skipIf(!connectionString)('Attention transaction events over real Postgres', () => {
  it('publishes expiry without altering execution state, isolates ACK revisions and replays late commits', async () => {
    if (!connectionString) throw new Error('Attention event test requires a database URL');
    const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
    const businessSchema = `mf_attention_test_${suffix}`;
    const eventSchema = `mf_attention_log_test_${suffix}`;
    const owner = `"${businessSchema}".ai_conversation_attention`;
    const writer = new Pool({ connectionString, max: 3 });
    const source = new AttentionEventsPostgres({ connectionString, businessSchema, eventSchema });
    let held: PoolClient | null = null;
    let unsubscribe: (() => void) | undefined;
    try {
      await writer.query(`CREATE SCHEMA "${businessSchema}";
        CREATE TABLE ${owner}(id TEXT PRIMARY KEY,identity_id TEXT NOT NULL,runtime_kind TEXT NOT NULL,conversation_id TEXT NOT NULL,
          run_id TEXT NOT NULL,run_sequence INTEGER NOT NULL DEFAULT 1,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,
          seen_revision INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMP(3) NOT NULL,provider_secret TEXT,
          UNIQUE(identity_id,runtime_kind,conversation_id));`);
      await source.init();
      const wake = vi.fn();
      unsubscribe = source.subscribe(wake);
      await vi.waitFor(() => expect(wake).toHaveBeenCalled());
      await writer.query(`INSERT INTO ${owner}(id,identity_id,runtime_kind,conversation_id,run_id,state,updated_at,provider_secret)
        VALUES('row','owner','builtin','conversation','run','working',(now() AT TIME ZONE 'UTC')-interval '119.8 seconds','PRIVATE_SECRET')`);
      // read() does not expire rows: this proves the deadline timer emits a durable change.
      await vi.waitFor(
        async () => {
          const events = await source.read('owner', 0);
          expect(events.at(-1)?.data.attention?.state).toBe('normal');
        },
        { timeout: 5000 },
      );
      let events = await source.read('owner', 0);
      expect(events.map((event) => event.data.attention?.state)).toEqual(['working', 'normal']);
      expect(events.at(-1)?.resourceVersion).toBe(2);
      const unchanged = await writer.query(`SELECT state,revision FROM ${owner} WHERE id='row'`);
      expect(unchanged.rows[0]).toEqual({ state: 'working', revision: 1 });
      await writer.query(`UPDATE ${owner} SET updated_at=now() AT TIME ZONE 'UTC' WHERE id='row'`);
      expect((await source.snapshot('owner', ['conversation'], 'builtin'))[0]).toMatchObject({
        state: 'working',
        revision: 1,
        resourceVersion: 3,
      });
      await writer.query(
        `UPDATE ${owner} SET state='done',revision=2,run_sequence=2 WHERE id='row'`,
      );
      await writer.query(
        `UPDATE ${owner} SET seen_revision=2 WHERE id='row' AND revision>=2 AND seen_revision<2`,
      );
      expect((await source.snapshot('owner', ['conversation'], 'builtin'))[0]).toMatchObject({
        state: 'normal',
        revision: 2,
        seenRevision: 2,
        resourceVersion: 5,
      });
      await writer.query(`UPDATE ${owner} SET revision=3,run_sequence=3 WHERE id='row'`);
      await writer.query(
        `UPDATE ${owner} SET seen_revision=2 WHERE id='row' AND revision>=2 AND seen_revision<2`,
      );
      expect((await source.snapshot('owner', ['conversation'], 'builtin'))[0]).toMatchObject({
        state: 'done',
        revision: 3,
        seenRevision: 2,
        resourceVersion: 6,
      });
      expect(await source.snapshot('foreign', ['conversation'], 'builtin')).toEqual([]);
      expect(await source.read('foreign', 0)).toEqual([]);
      expect(JSON.stringify(await source.read('owner', 0))).not.toContain('PRIVATE_SECRET');
      held = await writer.connect();
      await held.query('BEGIN');
      await held.query(`UPDATE ${owner} SET state='failed',revision=4 WHERE id='row'`);
      await held.query('ROLLBACK');
      events = await source.read('owner', 0);
      expect(events.at(-1)?.resourceVersion).toBe(6);
      await writer.query(`DELETE FROM ${owner} WHERE id='row'`);
      expect((await source.read('owner', 0)).at(-1)).toMatchObject({
        resourceVersion: 7,
        data: { attention: null, conversationId: 'conversation', runtimeKind: 'builtin' },
      });
      const insert = (id: string) =>
        writer.query(
          `INSERT INTO ${owner}(id,identity_id,runtime_kind,conversation_id,run_id,state,updated_at)
        VALUES($1,'owner','builtin',$1,$1,'working',now() AT TIME ZONE 'UTC')`,
          [id],
        );
      await insert('late');
      const before = await source.head('owner');
      await held.query('BEGIN');
      await held.query(`UPDATE ${owner} SET state='done',revision=2 WHERE id='late'`);
      await insert('early');
      const early = await source.read('owner', before.last);
      expect(early).toHaveLength(1);
      expect(early[0]?.data.conversationId).toBe('early');
      await held.query('COMMIT');
      const late = await source.read('owner', early[0]!.sequence);
      expect(late).toHaveLength(1);
      expect(late[0]?.data).toMatchObject({
        conversationId: 'late',
        attention: { state: 'done', revision: 2 },
      });
      unsubscribe();
      const restored = new AttentionEventsPostgres({
        connectionString,
        businessSchema,
        eventSchema,
      });
      try {
        await restored.init();
        expect(restored.epoch).toBe(source.epoch);
        expect(await restored.read('owner', early[0]!.sequence)).toHaveLength(1);
      } finally {
        await restored.dispose();
      }
    } finally {
      unsubscribe?.();
      if (held) {
        await held.query('ROLLBACK');
        held.release();
      }
      await source.dispose();
      if (
        !/^mf_attention_(?:log_)?test_[a-f0-9]{16}$/.test(businessSchema) ||
        !/^mf_attention_log_test_[a-f0-9]{16}$/.test(eventSchema)
      )
        throw new Error('Unsafe Attention test cleanup');
      await writer.query(
        `DROP SCHEMA IF EXISTS "${businessSchema}" CASCADE; DROP SCHEMA IF EXISTS "${eventSchema}" CASCADE`,
      );
      await writer.end();
    }
  }, 30_000);
});
