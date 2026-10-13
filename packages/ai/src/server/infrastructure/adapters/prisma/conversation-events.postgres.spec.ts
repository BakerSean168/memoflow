import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { ConversationEventsPostgres } from './conversation-events.postgres';

const connectionString = process.env.MEMOFLOW_WORKSPACE_EVENTS_PG_URL;
describe.skipIf(!connectionString)('Conversation events over real Postgres', () => {
  it('orders committed summaries independently of clocks and persists deletion tombstones', async () => {
    if (!connectionString) throw new Error('Conversation test requires a database URL');
    const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
    const businessSchema = `mf_conversation_test_${suffix}`;
    const eventSchema = `mf_conversation_log_test_${suffix}`;
    const table = `"${businessSchema}".ai_conversations`;
    const writer = new Pool({ connectionString, max: 2 });
    const source = new ConversationEventsPostgres({
      connectionString,
      businessSchema,
      eventSchema,
    });
    const peer = new ConversationEventsPostgres({ connectionString, businessSchema, eventSchema });
    const identityId = randomUUID();
    const conversationId = randomUUID();
    let held: Awaited<ReturnType<Pool['connect']>> | null = null;
    try {
      await writer.query(`CREATE SCHEMA "${businessSchema}";
        CREATE TABLE ${table}(id TEXT PRIMARY KEY,identity_id TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL,
          version INTEGER NOT NULL,created_at TIMESTAMP(3) NOT NULL,updated_at TIMESTAMP(3) NOT NULL,deleted_at TIMESTAMP(3),private_prompt TEXT);`);
      await writer.query(
        `INSERT INTO ${table}(id,identity_id,name,status,version,created_at,updated_at,private_prompt)
        VALUES($1,$2,'Initial','Active',1,now() AT TIME ZONE 'UTC',now() AT TIME ZONE 'UTC','PRIVATE_PROMPT')`,
        [conversationId, identityId],
      );
      // Two API workers install the same capture owner safely.
      await Promise.all([source.init(), peer.init()]);
      expect(peer.epoch).toBe(source.epoch);
      expect((await source.snapshot(identityId, [conversationId]))[0]).toMatchObject({
        name: 'Initial',
        resourceVersion: 1,
      });
      await writer.query(
        `UPDATE ${table} SET name='Renamed',updated_at=updated_at-interval '1 hour' WHERE id=$1`,
        [conversationId],
      );
      const changes = await peer.read(identityId, 0);
      expect(changes.map((change) => change.resourceVersion)).toEqual([1, 2]);
      expect(changes[1].data.conversation).toMatchObject({ name: 'Renamed', resourceVersion: 2 });
      expect(changes[1].data.conversation!.updatedAt).toBeLessThan(
        changes[0].data.conversation!.updatedAt,
      );
      expect(JSON.stringify(changes)).not.toContain('PRIVATE_PROMPT');
      expect(await source.read(randomUUID(), 0)).toEqual([]);
      held = await writer.connect();
      await held.query('BEGIN');
      await held.query(`UPDATE ${table} SET name='Rollback' WHERE id=$1`, [conversationId]);
      await held.query('ROLLBACK');
      expect((await source.head(identityId)).last).toBe(2);
      await writer.query(
        `UPDATE ${table} SET status='Archived',deleted_at=now() AT TIME ZONE 'UTC' WHERE id=$1`,
        [conversationId],
      );
      expect((await peer.read(identityId, 2))[0]).toMatchObject({
        resourceVersion: 3,
        data: { conversation: null },
      });
      expect(await source.snapshot(identityId, [conversationId])).toEqual([]);
    } finally {
      if (held) {
        await held.query('ROLLBACK');
        held.release();
      }
      await source.dispose();
      await peer.dispose();
      if (
        !/^mf_conversation_test_[a-f0-9]{16}$/.test(businessSchema) ||
        !/^mf_conversation_log_test_[a-f0-9]{16}$/.test(eventSchema)
      )
        throw new Error('Unsafe test cleanup');
      await writer.query(
        `DROP SCHEMA IF EXISTS "${businessSchema}" CASCADE; DROP SCHEMA IF EXISTS "${eventSchema}" CASCADE`,
      );
      await writer.end();
    }
  }, 30_000);
});
