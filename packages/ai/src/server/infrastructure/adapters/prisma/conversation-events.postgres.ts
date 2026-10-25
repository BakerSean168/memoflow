import { createHash, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { z } from 'zod';
import { AIConversationClientDTOSchema } from '@memoflow/contracts/ai';
import type {
  ConversationChange,
  ConversationEventSource,
} from '../../../domain/repositories/conversation-events.port';

const positive = z.coerce.number().int().positive();
const counter = z.coerce.number().int().nonnegative();
const viewSchema = AIConversationClientDTOSchema.extend({ resourceVersion: positive }).strict();
function decode(payload: unknown, version: unknown, deleted: unknown): ConversationChange['data'] {
  const raw = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const view = AIConversationClientDTOSchema.parse(raw);
  return {
    conversationId: String(view.id),
    runtimeKind: 'builtin',
    conversation: z.boolean().parse(deleted)
      ? null
      : viewSchema.parse({ ...view, resourceVersion: positive.parse(version) }),
  };
}

/** Capture product Conversation shells in their native PostgreSQL transaction. */
export class ConversationEventsPostgres implements ConversationEventSource {
  private readonly pool: Pool;
  private readonly ownerTable: string;
  private readonly prefix: string;
  private readonly channel: string;
  private epochValue = '';
  private initializing: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private listening: PoolClient | null = null;
  private connecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  get epoch() {
    return this.epochValue;
  }

  constructor(input: { connectionString: string; businessSchema?: string; eventSchema?: string }) {
    const business =
      input.businessSchema ??
      new URL(input.connectionString).searchParams.get('schema') ??
      'public';
    const suffix = createHash('sha256').update(business).digest('hex').slice(0, 16);
    const eventSchema = input.eventSchema ?? `mf_conversation_events_${suffix}`;
    for (const name of [business, eventSchema])
      if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(name))
        throw new Error('Invalid Conversation event schema');
    this.ownerTable = `"${business}".ai_conversations`;
    this.prefix = `"${eventSchema}".`;
    this.channel = `mf_conversation_${createHash('sha256').update(eventSchema).digest('hex').slice(0, 24)}`;
    this.pool = new Pool({
      connectionString: input.connectionString,
      max: 4,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    });
    this.pool.on('error', this.wake);
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let discard = false;
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        discard = true;
      }
      throw error;
    } finally {
      client.release(discard);
    }
  }

  init(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Conversation event source is closed'));
    return (this.initializing ??= this.initialize());
  }
  private async initialize() {
    const p = this.prefix;
    const schema = p.slice(0, -1);
    await this.transaction(async (tx) => {
      // API workers may initialize together; serialize this owner's DDL.
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [schema]);
      await tx.query(`CREATE SCHEMA IF NOT EXISTS ${schema};
        CREATE TABLE IF NOT EXISTS ${p}metadata(id INTEGER PRIMARY KEY CHECK(id=1),epoch TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ${p}heads(identity_id TEXT PRIMARY KEY,last_sequence BIGINT NOT NULL DEFAULT 0,pruned_through BIGINT NOT NULL DEFAULT 0,last_pruned_at TIMESTAMPTZ NOT NULL DEFAULT 'epoch');
        CREATE TABLE IF NOT EXISTS ${p}states(identity_id TEXT NOT NULL,resource_key TEXT NOT NULL,resource_version BIGINT NOT NULL,payload JSONB NOT NULL,deleted BOOLEAN NOT NULL,PRIMARY KEY(identity_id,resource_key));
        CREATE TABLE IF NOT EXISTS ${p}events(event_id TEXT PRIMARY KEY,identity_id TEXT NOT NULL,resource_key TEXT NOT NULL,resource_version BIGINT NOT NULL,payload JSONB NOT NULL,deleted BOOLEAN NOT NULL,sequence BIGINT,captured_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
        CREATE UNIQUE INDEX IF NOT EXISTS conversation_owner_sequence ON ${p}events(identity_id,sequence);
        CREATE INDEX IF NOT EXISTS conversation_pending ON ${p}events(identity_id) WHERE sequence IS NULL;`);
      await tx.query(`INSERT INTO ${p}metadata(id,epoch) VALUES(1,$1) ON CONFLICT DO NOTHING`, [
        randomUUID(),
      ]);
      await tx.query(`CREATE OR REPLACE FUNCTION ${p}capture_conversation() RETURNS trigger LANGUAGE plpgsql AS $fn$
        DECLARE target ${this.ownerTable}%ROWTYPE; previous ${p}states%ROWTYPE;
          payload JSONB; version BIGINT; is_deleted BOOLEAN;
        BEGIN
          IF TG_OP='DELETE' THEN target := OLD; ELSE target := NEW; END IF;
          IF TG_OP='UPDATE' AND (OLD.identity_id <> NEW.identity_id OR OLD.id <> NEW.id) THEN RAISE EXCEPTION 'Conversation owner cannot change'; END IF;
          SELECT * INTO previous FROM ${p}states WHERE identity_id=target.identity_id AND resource_key=target.id;
          is_deleted := TG_OP='DELETE' OR target.deleted_at IS NOT NULL;
          payload := jsonb_build_object('id',target.id,'identityId',target.identity_id,'name',target.name,'status',target.status,
            'version',target.version,'createdAt',floor(extract(epoch FROM target.created_at)*1000)::bigint,
            'updatedAt',floor(extract(epoch FROM target.updated_at)*1000)::bigint,
            'deletedAt',CASE WHEN target.deleted_at IS NULL THEN NULL ELSE floor(extract(epoch FROM target.deleted_at)*1000)::bigint END);
          version := COALESCE(previous.resource_version,0);
          IF previous.resource_key IS NULL OR previous.payload <> payload OR previous.deleted <> is_deleted THEN
            version := version+1;
            INSERT INTO ${p}events(event_id,identity_id,resource_key,resource_version,payload,deleted)
              VALUES(gen_random_uuid()::text,target.identity_id,target.id,version,payload,is_deleted);
            PERFORM pg_notify('${this.channel}','');
          END IF;
          INSERT INTO ${p}states(identity_id,resource_key,resource_version,payload,deleted)
            VALUES(target.identity_id,target.id,version,payload,is_deleted) ON CONFLICT(identity_id,resource_key)
            DO UPDATE SET resource_version=excluded.resource_version,payload=excluded.payload,deleted=excluded.deleted;
          RETURN target;
        END $fn$;
        DROP TRIGGER IF EXISTS memoflow_conversation_events_capture ON ${this.ownerTable};
        CREATE TRIGGER memoflow_conversation_events_capture AFTER INSERT OR UPDATE OR DELETE ON ${this.ownerTable} FOR EACH ROW EXECUTE FUNCTION ${p}capture_conversation();`);
    });
    const row = await this.pool.query(`SELECT epoch FROM ${p}metadata WHERE id=1`);
    this.epochValue = z.string().uuid().parse(row.rows[0]?.epoch);
  }

  private async dispatch(identityId: string) {
    await this.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO ${this.prefix}heads(identity_id) VALUES($1) ON CONFLICT DO NOTHING`,
        [identityId],
      );
      const head = await tx.query(
        `SELECT last_sequence FROM ${this.prefix}heads WHERE identity_id=$1 FOR UPDATE`,
        [identityId],
      );
      let sequence = counter.parse(head.rows[0]?.last_sequence);
      const pending = await tx.query(
        `SELECT event_id FROM ${this.prefix}events WHERE identity_id=$1 AND sequence IS NULL ORDER BY captured_at,event_id LIMIT 100`,
        [identityId],
      );
      for (const row of pending.rows)
        await tx.query(`UPDATE ${this.prefix}events SET sequence=$1 WHERE event_id=$2`, [
          ++sequence,
          z.string().parse(row.event_id),
        ]);
      await tx.query(`UPDATE ${this.prefix}heads SET last_sequence=$2 WHERE identity_id=$1`, [
        identityId,
        sequence,
      ]);
    });
  }

  async head(identityId: string) {
    if (this.disposed) throw new Error('Conversation event source is closed');
    await this.dispatch(identityId);
    return this.transaction(async (tx) => {
      const row = await tx.query(
        `SELECT *,last_pruned_at < now()-interval '1 hour' AS prune FROM ${this.prefix}heads WHERE identity_id=$1 FOR UPDATE`,
        [identityId],
      );
      if (row.rows[0]?.prune) {
        const expired = await tx.query(
          `DELETE FROM ${this.prefix}events WHERE event_id IN (
          SELECT event_id FROM ${this.prefix}events WHERE identity_id=$1 AND sequence IS NOT NULL AND captured_at<now()-interval '7 days' ORDER BY sequence LIMIT 1000) RETURNING sequence`,
          [identityId],
        );
        const through = expired.rows.reduce(
          (last, event) => Math.max(last, positive.parse(event.sequence)),
          0,
        );
        await tx.query(
          `UPDATE ${this.prefix}heads SET pruned_through=GREATEST(pruned_through,$2),last_pruned_at=CASE WHEN $3 THEN now() ELSE last_pruned_at END WHERE identity_id=$1`,
          [identityId, through, expired.rows.length < 1000],
        );
      }
      const head = await tx.query(
        `SELECT pruned_through+1 AS first,last_sequence AS last FROM ${this.prefix}heads WHERE identity_id=$1`,
        [identityId],
      );
      return {
        first: positive.parse(head.rows[0]?.first),
        last: counter.parse(head.rows[0]?.last),
      };
    });
  }

  async read(identityId: string, after: number): Promise<ConversationChange[]> {
    if (this.disposed) throw new Error('Conversation event source is closed');
    await this.dispatch(identityId);
    const result = await this.pool.query(
      `SELECT * FROM ${this.prefix}events WHERE identity_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 100`,
      [identityId, after],
    );
    return result.rows.map((row) => ({
      eventId: z.string().uuid().parse(row.event_id),
      sequence: positive.parse(row.sequence),
      resourceVersion: positive.parse(row.resource_version),
      data: decode(row.payload, row.resource_version, row.deleted),
    }));
  }

  async snapshot(identityId: string, conversationIds: readonly string[]) {
    if (this.disposed) throw new Error('Conversation event source is closed');
    await this.init();
    if (!conversationIds.length) return [];
    if (conversationIds.length > 100) throw new Error('Conversation snapshot scope is too large');
    await this.pool.query(
      `UPDATE ${this.ownerTable} n SET name=name WHERE identity_id=$1 AND id=ANY($2::text[])
      AND NOT EXISTS(SELECT 1 FROM ${this.prefix}states s WHERE s.identity_id=n.identity_id AND s.resource_key=n.id)`,
      [identityId, conversationIds],
    );
    const result = await this.pool.query(
      `SELECT s.payload,s.resource_version FROM ${this.prefix}states s JOIN ${this.ownerTable} n
      ON n.identity_id=s.identity_id AND s.resource_key=n.id WHERE s.identity_id=$1 AND n.id=ANY($2::text[]) AND NOT s.deleted`,
      [identityId, conversationIds],
    );
    return result.rows
      .map((row) => decode(row.payload, row.resource_version, false).conversation)
      .filter((view) => view !== null);
  }

  subscribe(wake: () => void) {
    if (this.disposed) throw new Error('Conversation event source is closed');
    this.listeners.add(wake);
    void this.connect();
    return () => {
      this.listeners.delete(wake);
      if (!this.listeners.size) this.disconnect();
    };
  }
  private readonly wake = () => {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        this.listeners.delete(listener);
      }
    }
  };
  private readonly notified = () => {
    this.wake();
  };
  private async connect() {
    if (this.disposed || this.connecting || this.listening || !this.listeners.size) return;
    this.connecting = true;
    try {
      const client = await this.pool.connect();
      if (this.disposed || !this.listeners.size) {
        client.release();
        return;
      }
      this.listening = client;
      client.on('notification', this.notified);
      client.on('error', this.failed);
      client.on('end', this.failed);
      await client.query(`LISTEN "${this.channel}"`);
      this.notified();
    } catch {
      this.failed();
    } finally {
      this.connecting = false;
    }
  }
  private readonly failed = () => {
    this.disconnect();
    this.wake();
    if (!this.disposed && this.listeners.size)
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        void this.connect();
      }, 1000);
  };
  private disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const client = this.listening;
    this.listening = null;
    if (client) {
      client.removeListener('notification', this.notified);
      client.removeListener('error', this.failed);
      client.removeListener('end', this.failed);
      client.release(true);
    }
  }
  async dispose() {
    this.disposed = true;
    this.wake();
    this.listeners.clear();
    this.disconnect();
    await this.pool.end();
  }
}
