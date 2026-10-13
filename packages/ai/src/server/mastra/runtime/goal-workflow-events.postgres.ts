import { createHash, randomUUID } from 'node:crypto';
import type { PostgresStore } from '@mastra/pg';
import type { GoalWorkflowEventSource } from '../../application/ports/goal-workflow-events.port';
import { AI_PUBLIC_FAILURE_CODES } from '../../../shared/ai-public-failure';
import { decodeGoalEventState, decodeGoalWorkflowChange } from './goal-workflow-event-codec';

/** Business commits capture an outbox; a separate owner-serialized transaction assigns delivery order. */
export class GoalWorkflowEventsPostgres implements GoalWorkflowEventSource {
  private readonly prefix: string;
  private readonly channel: string;
  private epochValue = '';
  private initializing: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private listening: Awaited<ReturnType<PostgresStore['db']['connect']>> | null = null;
  private connecting = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  get epoch() {
    return this.epochValue;
  }

  constructor(
    private readonly store: PostgresStore,
    schema: string,
  ) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(schema))
      throw new Error('Invalid Goal event storage schema');
    this.prefix = `"${schema}".`;
    this.channel = `memoflow_goal_${createHash('sha256').update(schema).digest('hex').slice(0, 24)}`;
  }

  init(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Goal event source is closed'));
    return (this.initializing ??= this.initialize());
  }

  private async initialize() {
    const p = this.prefix;
    const codes = AI_PUBLIC_FAILURE_CODES.map((code) => `'${code}'`).join(',');
    await this.store.db.tx(async (tx) => {
      await tx.none(`CREATE TABLE IF NOT EXISTS ${p}memoflow_goal_event_meta(id INTEGER PRIMARY KEY CHECK(id=1),epoch TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ${p}memoflow_goal_event_heads(identity_id TEXT PRIMARY KEY,last_sequence BIGINT NOT NULL DEFAULT 0,pruned_through BIGINT NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS ${p}memoflow_goal_event_states(identity_id TEXT NOT NULL,run_id TEXT NOT NULL,resource_version BIGINT NOT NULL,payload JSONB NOT NULL,current_actions JSONB NOT NULL,PRIMARY KEY(identity_id,run_id));
        CREATE TABLE IF NOT EXISTS ${p}memoflow_goal_events(event_id TEXT PRIMARY KEY,identity_id TEXT NOT NULL,run_id TEXT NOT NULL,resource_version BIGINT NOT NULL,payload JSONB NOT NULL,actions JSONB NOT NULL,base_action_sequence INTEGER NOT NULL,last_action_sequence INTEGER NOT NULL,sequence BIGINT,captured_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
        CREATE UNIQUE INDEX IF NOT EXISTS memoflow_goal_events_owner_sequence ON ${p}memoflow_goal_events(identity_id,sequence);
        CREATE INDEX IF NOT EXISTS memoflow_goal_events_pending ON ${p}memoflow_goal_events(identity_id) WHERE sequence IS NULL;`);
      await tx.none(
        `INSERT INTO ${p}memoflow_goal_event_meta(id,epoch) VALUES(1,$1) ON CONFLICT(id) DO NOTHING`,
        [randomUUID()],
      );
      await tx.none(`CREATE OR REPLACE FUNCTION ${p}memoflow_capture_goal_event() RETURNS trigger LANGUAGE plpgsql AS $fn$
        DECLARE previous ${p}memoflow_goal_event_states%ROWTYPE;
          state JSONB; incoming JSONB; journal JSONB; delta JSONB; version BIGINT;
          base_count INTEGER; final_count INTEGER; code TEXT; limit_kind TEXT; retry_kind TEXT; after_ms BIGINT;
        BEGIN
          IF NEW.workflow_name <> 'goal-create' OR NEW."resourceId" IS NULL THEN RETURN NEW; END IF;
          IF TG_OP='UPDATE' AND OLD."resourceId" IS NOT NULL AND OLD."resourceId" <> NEW."resourceId" THEN RAISE EXCEPTION 'Goal workflow owner cannot change'; END IF;
          IF NEW.snapshot #>> '{context,input,identityId}' IS NOT NULL AND NEW.snapshot #>> '{context,input,identityId}' <> NEW."resourceId" THEN RAISE EXCEPTION 'Goal workflow owner mismatch'; END IF;
          SELECT * INTO previous FROM ${p}memoflow_goal_event_states WHERE identity_id=NEW."resourceId" AND run_id=NEW.run_id;
          IF NEW.snapshot #>> '{context,input,conversationId}' IS NULL AND previous.run_id IS NULL THEN RETURN NEW; END IF;
          IF NEW.snapshot #>> '{context,input,conversationId}' IS NOT NULL AND previous.payload->>'conversationId' <> NEW.snapshot #>> '{context,input,conversationId}' THEN RAISE EXCEPTION 'Goal workflow conversation cannot change'; END IF;
          incoming := COALESCE(NEW.snapshot #> '{value,liveActions}','[]'::jsonb);
          IF jsonb_array_length(COALESCE(NEW.snapshot->'goalLiveActions','[]'::jsonb)) > jsonb_array_length(incoming) THEN incoming := NEW.snapshot->'goalLiveActions'; END IF;
          base_count := jsonb_array_length(COALESCE(previous.current_actions,'[]'::jsonb));
          IF EXISTS(SELECT 1 FROM jsonb_array_elements(incoming) WITH ORDINALITY n(value,idx)
            JOIN jsonb_array_elements(COALESCE(previous.current_actions,'[]'::jsonb)) WITH ORDINALITY o(value,idx) USING(idx) WHERE n.value <> o.value)
            THEN RAISE EXCEPTION 'Goal workflow action history cannot change'; END IF;
          journal := CASE WHEN jsonb_array_length(incoming) >= base_count THEN incoming ELSE previous.current_actions END;
          final_count := jsonb_array_length(journal);
          IF NEW.snapshot->>'status' IN ('failed','tripwire') THEN
            code := CASE WHEN NEW.snapshot #>> '{error,code}' IN (${codes}) THEN NEW.snapshot #>> '{error,code}' ELSE 'AI_RUNTIME_TRANSPORT_ERROR' END;
            IF NEW.snapshot #>> '{error,failure,details,limitKind}' IN ('rate_limit','quota_exhausted','unknown') THEN limit_kind := NEW.snapshot #>> '{error,failure,details,limitKind}'; END IF;
            IF NEW.snapshot #>> '{error,failure,retryHint,kind}' IN ('after','transient','not_retryable') THEN retry_kind := NEW.snapshot #>> '{error,failure,retryHint,kind}'; END IF;
            IF jsonb_typeof(NEW.snapshot #> '{error,failure,retryHint,afterMs}')='number' AND (NEW.snapshot #>> '{error,failure,retryHint,afterMs}')::numeric BETWEEN 0 AND 86400000
              AND trunc((NEW.snapshot #>> '{error,failure,retryHint,afterMs}')::numeric)=(NEW.snapshot #>> '{error,failure,retryHint,afterMs}')::numeric
              THEN after_ms := (NEW.snapshot #>> '{error,failure,retryHint,afterMs}')::bigint; END IF;
          END IF;
          state := jsonb_build_object('runId',NEW.run_id,'conversationId',COALESCE(NEW.snapshot #>> '{context,input,conversationId}',previous.payload->>'conversationId'),
            'status',NEW.snapshot->>'status','createdAt',NEW."createdAtZ",'updatedAt',NEW."updatedAtZ",
            'startRequestId',COALESCE(NEW.snapshot #>> '{context,input,sourceDraft,attemptId}',previous.payload->>'startRequestId'),
            'suspension',NEW.snapshot #> '{context,goal-create-lifecycle,suspendPayload}','result',NEW.snapshot->'result',
            'receipt',COALESCE(NEW.snapshot #> '{value,priorReceipt}',previous.payload->'receipt'),
            'errorCode',code,'limitKind',limit_kind,'retryKind',retry_kind,'afterMs',after_ms);
          version := COALESCE(previous.resource_version,0);
          IF previous.run_id IS NULL OR (previous.payload - 'createdAt' - 'updatedAt') <> (state - 'createdAt' - 'updatedAt') OR previous.current_actions <> journal THEN
            version := version + 1;
            SELECT COALESCE(jsonb_agg(value ORDER BY idx),'[]'::jsonb) INTO delta FROM jsonb_array_elements(journal) WITH ORDINALITY a(value,idx) WHERE idx > base_count;
            INSERT INTO ${p}memoflow_goal_events(event_id,identity_id,run_id,resource_version,payload,actions,base_action_sequence,last_action_sequence)
              VALUES(NEW.run_id||':'||version,NEW."resourceId",NEW.run_id,version,state,delta,base_count,final_count);
            PERFORM pg_notify('${this.channel}','');
          END IF;
          INSERT INTO ${p}memoflow_goal_event_states(identity_id,run_id,resource_version,payload,current_actions)
            VALUES(NEW."resourceId",NEW.run_id,version,state,journal) ON CONFLICT(identity_id,run_id) DO UPDATE
            SET resource_version=excluded.resource_version,payload=excluded.payload,current_actions=excluded.current_actions;
          RETURN NEW;
        END $fn$;
        DROP TRIGGER IF EXISTS memoflow_goal_events_capture ON ${p}mastra_workflow_snapshot;
        CREATE TRIGGER memoflow_goal_events_capture AFTER INSERT OR UPDATE ON ${p}mastra_workflow_snapshot FOR EACH ROW EXECUTE FUNCTION ${p}memoflow_capture_goal_event();`);
    });
    const row = await this.store.db.one<{ epoch: string }>(
      `SELECT epoch FROM ${p}memoflow_goal_event_meta WHERE id=1`,
    );
    this.epochValue = row.epoch;
  }

  private async dispatch(identityId: string) {
    const p = this.prefix;
    await this.store.db.tx(async (tx) => {
      await tx.none(
        `INSERT INTO ${p}memoflow_goal_event_heads(identity_id) VALUES($1) ON CONFLICT DO NOTHING`,
        [identityId],
      );
      const head = await tx.one<{ last_sequence: string }>(
        `SELECT last_sequence FROM ${p}memoflow_goal_event_heads WHERE identity_id=$1 FOR UPDATE`,
        [identityId],
      );
      const pending = await tx.any<{ event_id: string }>(
        `SELECT event_id FROM ${p}memoflow_goal_events WHERE identity_id=$1 AND sequence IS NULL ORDER BY captured_at,event_id LIMIT 100`,
        [identityId],
      );
      let sequence = Number(head.last_sequence);
      if (!Number.isSafeInteger(sequence)) throw new Error('Goal event sequence is invalid');
      for (const row of pending) {
        sequence += 1;
        await tx.none(`UPDATE ${p}memoflow_goal_events SET sequence=$1 WHERE event_id=$2`, [
          sequence,
          row.event_id,
        ]);
      }
      await tx.none(
        `UPDATE ${p}memoflow_goal_event_heads SET last_sequence=$2 WHERE identity_id=$1`,
        [identityId, sequence],
      );
    });
  }

  async head(identityId: string) {
    if (this.disposed) throw new Error('Goal event source is closed');
    await this.dispatch(identityId);
    const p = this.prefix;
    await this.store.db.tx(async (tx) => {
      await tx.none(
        `UPDATE ${p}memoflow_goal_event_heads SET pruned_through=GREATEST(pruned_through,
        COALESCE((SELECT MAX(sequence) FROM ${p}memoflow_goal_events WHERE identity_id=$1 AND captured_at < now()-interval '7 days'),0)) WHERE identity_id=$1`,
        [identityId],
      );
      await tx.none(
        `DELETE FROM ${p}memoflow_goal_events WHERE identity_id=$1 AND sequence IS NOT NULL AND captured_at < now()-interval '7 days'`,
        [identityId],
      );
    });
    const row = await this.store.db.one<{ first: string; last: string }>(
      `SELECT pruned_through+1 AS first,last_sequence AS last FROM ${p}memoflow_goal_event_heads WHERE identity_id=$1`,
      [identityId],
    );
    return { first: Number(row.first), last: Number(row.last) };
  }

  async read(identityId: string, after: number) {
    if (this.disposed) throw new Error('Goal event source is closed');
    await this.dispatch(identityId);
    const rows = await this.store.db.any<Record<string, unknown>>(
      `SELECT * FROM ${this.prefix}memoflow_goal_events WHERE identity_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 100`,
      [identityId, after],
    );
    return rows.map(decodeGoalWorkflowChange);
  }

  async snapshot(identityId: string, runId: string) {
    if (this.disposed) throw new Error('Goal event source is closed');
    const p = this.prefix;
    await this.store.db.none(
      `UPDATE ${p}mastra_workflow_snapshot SET snapshot=snapshot WHERE workflow_name='goal-create' AND run_id=$1 AND "resourceId"=$2
      AND NOT EXISTS(SELECT 1 FROM ${p}memoflow_goal_event_states WHERE identity_id=$2 AND run_id=$1)`,
      [runId, identityId],
    );
    const row = await this.store.db.oneOrNone<Record<string, unknown>>(
      `SELECT s.payload,s.current_actions,s.resource_version FROM ${p}memoflow_goal_event_states s JOIN ${p}mastra_workflow_snapshot w
      ON w.workflow_name='goal-create' AND w.run_id=s.run_id AND w."resourceId"=s.identity_id WHERE s.identity_id=$1 AND s.run_id=$2`,
      [identityId, runId],
    );
    return row
      ? decodeGoalEventState(row.payload, row.resource_version, row.current_actions)
      : null;
  }

  subscribe(wake: () => void) {
    if (this.disposed) throw new Error('Goal event source is closed');
    this.listeners.add(wake);
    void this.connectListener();
    return () => {
      this.listeners.delete(wake);
      if (!this.listeners.size) this.disconnectListener();
    };
  }
  private async connectListener() {
    if (this.disposed || this.connecting || this.listening || !this.listeners.size) return;
    this.connecting = true;
    try {
      const client = await this.store.db.connect();
      if (this.disposed || !this.listeners.size) {
        client.release();
        return;
      }
      this.listening = client;
      client.on('notification', this.wake);
      client.on('error', this.listenerFailed);
      client.on('end', this.listenerFailed);
      await client.query(`LISTEN "${this.channel}"`);
      this.wake(); // Catch commits that happened before LISTEN became active.
    } catch {
      this.listenerFailed();
    } finally {
      this.connecting = false;
    }
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
  private readonly listenerFailed = () => {
    this.disconnectListener();
    this.wake();
    if (!this.disposed && this.listeners.size)
      this.retry = setTimeout(() => {
        this.retry = null;
        void this.connectListener();
      }, 1000);
  };
  private disconnectListener() {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const client = this.listening;
    this.listening = null;
    if (client) {
      client.removeListener('notification', this.wake);
      client.removeListener('error', this.listenerFailed);
      client.removeListener('end', this.listenerFailed);
      client.release(true);
    }
  }
  async dispose() {
    this.disposed = true;
    this.wake();
    this.listeners.clear();
    this.disconnectListener();
  }
}
