import { randomUUID } from 'node:crypto';
import type { SqliteClient } from '@mastra/libsql';
import type { GoalWorkflowEventSource } from '../../application/ports/goal-workflow-events.port';
import { AI_PUBLIC_FAILURE_CODES } from '../../../shared/ai-public-failure';
import { decodeGoalEventState, decodeGoalWorkflowChange } from './goal-workflow-event-codec';

const TABLE = 'mastra_workflow_snapshot';
const EVENTS = 'memoflow_goal_events';
const STATES = 'memoflow_goal_event_states';
const HEADS = 'memoflow_goal_event_heads';
const META = 'memoflow_goal_event_meta';
const codeList = AI_PUBLIC_FAILURE_CODES.map((code) => `'${code}'`).join(',');
const at = (path: string) => `json_extract(NEW.snapshot, '${path}')`;
const rawActions = `CASE WHEN json_array_length(COALESCE(${at('$.goalLiveActions')}, '[]')) >
  json_array_length(COALESCE(${at('$.value.liveActions')}, '[]'))
  THEN ${at('$.goalLiveActions')} ELSE COALESCE(${at('$.value.liveActions')}, '[]') END`;
const oldActions = `COALESCE((SELECT current_actions FROM ${STATES} WHERE identity_id=NEW.resourceId AND run_id=NEW.run_id), '[]')`;
const currentActions = `CASE WHEN json_array_length(${rawActions}) >= json_array_length(${oldActions}) THEN json(${rawActions}) ELSE ${oldActions} END`;
const oldCount = `json_array_length(${oldActions})`;
const baseVersion = `COALESCE((SELECT resource_version FROM ${STATES} WHERE identity_id=NEW.resourceId AND run_id=NEW.run_id),0)`;
const previousField = (field: string) =>
  `(SELECT json_extract(payload,'$.${field}') FROM ${STATES} WHERE identity_id=NEW.resourceId AND run_id=NEW.run_id)`;
// SQLite JSON text preserves object key order; that order is not a business change.
const sameJsonValue = (
  left: string,
  right: string,
) => `CASE WHEN json(${left})=json(${right}) THEN 1 ELSE
  (SELECT COUNT(*) FROM json_tree(${left}))=(SELECT COUNT(*) FROM json_tree(${right})) AND NOT EXISTS(
    SELECT fullkey,CASE WHEN type IN ('integer','real') THEN 'number' ELSE type END,atom FROM json_tree(${left})
    EXCEPT SELECT fullkey,CASE WHEN type IN ('integer','real') THEN 'number' ELSE type END,atom FROM json_tree(${right})) END`;
const terminal = `${at('$.status')} IN ('failed','tripwire')`;
const errorCode = `CASE WHEN ${terminal} THEN CASE WHEN ${at('$.error.code')} IN (${codeList}) THEN ${at('$.error.code')} ELSE 'AI_RUNTIME_TRANSPORT_ERROR' END ELSE NULL END`;
const limitKind = `CASE WHEN ${terminal} AND ${at('$.error.failure.details.limitKind')} IN ('rate_limit','quota_exhausted','unknown') THEN ${at('$.error.failure.details.limitKind')} ELSE NULL END`;
const retryKind = `CASE WHEN ${terminal} AND ${at('$.error.failure.retryHint.kind')} IN ('after','transient','not_retryable') THEN ${at('$.error.failure.retryHint.kind')} ELSE NULL END`;
const afterMs = `CASE WHEN ${terminal} AND json_type(NEW.snapshot,'$.error.failure.retryHint.afterMs')='integer' AND ${at('$.error.failure.retryHint.afterMs')} BETWEEN 0 AND 86400000 THEN ${at('$.error.failure.retryHint.afterMs')} ELSE NULL END`;
const payload = `json_object(
  'runId',NEW.run_id,'conversationId',COALESCE(${at('$.context.input.conversationId')},${previousField('conversationId')}),'status',${at('$.status')},
  'createdAt',NEW.createdAt,'updatedAt',NEW.updatedAt,
  'startRequestId',COALESCE(${at('$.context.input.sourceDraft.attemptId')},${previousField('startRequestId')}),
  'suspension',${at('$.context."goal-create-lifecycle".suspendPayload')},'result',${at('$.result')},
  'receipt',COALESCE(${at('$.value.priorReceipt')},${previousField('receipt')}),
  'errorCode',${errorCode},'limitKind',${limitKind},'retryKind',${retryKind},'afterMs',${afterMs})`;
const changed = `NOT EXISTS(SELECT 1 FROM ${STATES} WHERE identity_id=NEW.resourceId AND run_id=NEW.run_id
  AND (${sameJsonValue("json_remove(payload,'$.createdAt','$.updatedAt')", `json_remove(${payload},'$.createdAt','$.updatedAt')`)})
  AND (${sameJsonValue('current_actions', currentActions)}))`;

function trigger(operation: 'INSERT' | 'UPDATE') {
  return `CREATE TRIGGER IF NOT EXISTS memoflow_goal_events_${operation.toLowerCase()}
  AFTER ${operation} ON ${TABLE} WHEN NEW.workflow_name='goal-create' AND NEW.resourceId IS NOT NULL
  AND (${at('$.context.input.conversationId')} IS NOT NULL OR EXISTS(SELECT 1 FROM ${STATES} WHERE identity_id=NEW.resourceId AND run_id=NEW.run_id))
  BEGIN
    ${operation === 'UPDATE' ? "SELECT CASE WHEN OLD.resourceId IS NOT NULL AND OLD.resourceId <> NEW.resourceId THEN RAISE(ABORT,'Goal workflow owner cannot change') END;" : ''}
    SELECT CASE WHEN ${at('$.context.input.identityId')} IS NOT NULL AND ${at('$.context.input.identityId')} <> NEW.resourceId THEN RAISE(ABORT,'Goal workflow owner mismatch') END;
    SELECT CASE WHEN ${at('$.context.input.conversationId')} IS NOT NULL AND ${previousField('conversationId')} <> ${at('$.context.input.conversationId')} THEN RAISE(ABORT,'Goal workflow conversation cannot change') END;
    SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(${rawActions}) n JOIN json_each(${oldActions}) o ON n.key=o.key
      WHERE NOT (${sameJsonValue('n.value', 'o.value')})) THEN RAISE(ABORT,'Goal workflow action history cannot change') END;
    INSERT INTO ${EVENTS}(event_id,identity_id,run_id,resource_version,payload,actions,base_action_sequence,last_action_sequence,captured_at)
      SELECT NEW.run_id||':'||(${baseVersion}+1),NEW.resourceId,NEW.run_id,${baseVersion}+1,${payload},
      COALESCE((SELECT json_group_array(json(value)) FROM json_each(${rawActions}) WHERE CAST(key AS INTEGER)>=${oldCount}),'[]'),
      ${oldCount},json_array_length(${currentActions}),CAST(unixepoch('subsec')*1000 AS INTEGER) WHERE ${changed};
    INSERT INTO ${STATES}(identity_id,run_id,resource_version,payload,current_actions)
      VALUES(NEW.resourceId,NEW.run_id,${baseVersion}+CASE WHEN ${changed} THEN 1 ELSE 0 END,${payload},${currentActions})
      ON CONFLICT(identity_id,run_id) DO UPDATE SET resource_version=excluded.resource_version,payload=excluded.payload,current_actions=excluded.current_actions;
    INSERT INTO ${HEADS}(identity_id,last_sequence) SELECT NEW.resourceId,COALESCE(MAX(sequence),0) FROM ${EVENTS} WHERE identity_id=NEW.resourceId
      ON CONFLICT(identity_id) DO UPDATE SET last_sequence=MAX(last_sequence,excluded.last_sequence);
  END`;
}

/** Snapshot write and event capture share SQLite's actual transaction, including rollback. */
export class GoalWorkflowEventsLibSQL implements GoalWorkflowEventSource {
  private epochValue = '';
  private initializing: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<() => void>();
  private checking = false;
  private lastGlobalSequence = 0;
  private lastPrune = 0;
  private disposed = false;
  get epoch() {
    return this.epochValue;
  }
  constructor(private readonly client: SqliteClient) {}

  init(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Goal event source is closed'));
    return (this.initializing ??= (async () => {
      await this.client.batch(
        [
          `CREATE TABLE IF NOT EXISTS ${META}(id INTEGER PRIMARY KEY CHECK(id=1),epoch TEXT NOT NULL)`,
          { sql: `INSERT OR IGNORE INTO ${META}(id,epoch) VALUES(1,?)`, args: [randomUUID()] },
          `CREATE TABLE IF NOT EXISTS ${HEADS}(identity_id TEXT PRIMARY KEY,last_sequence INTEGER NOT NULL,pruned_through INTEGER NOT NULL DEFAULT 0)`,
          `CREATE TABLE IF NOT EXISTS ${STATES}(identity_id TEXT NOT NULL,run_id TEXT NOT NULL,resource_version INTEGER NOT NULL,payload TEXT NOT NULL,current_actions TEXT NOT NULL,PRIMARY KEY(identity_id,run_id))`,
          `CREATE TABLE IF NOT EXISTS ${EVENTS}(sequence INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL UNIQUE,identity_id TEXT NOT NULL,run_id TEXT NOT NULL,resource_version INTEGER NOT NULL,payload TEXT NOT NULL,actions TEXT NOT NULL,base_action_sequence INTEGER NOT NULL,last_action_sequence INTEGER NOT NULL,captured_at INTEGER NOT NULL)`,
          `CREATE INDEX IF NOT EXISTS memoflow_goal_events_owner_sequence ON ${EVENTS}(identity_id,sequence)`,
          'DROP TRIGGER IF EXISTS memoflow_goal_events_insert',
          'DROP TRIGGER IF EXISTS memoflow_goal_events_update',
          trigger('INSERT'),
          trigger('UPDATE'),
        ],
        'write',
      );
      const result = await this.client.execute(`SELECT epoch FROM ${META} WHERE id=1`);
      if (typeof result.rows[0]?.epoch !== 'string')
        throw new Error('Goal event epoch is unavailable');
      this.epochValue = result.rows[0].epoch;
    })());
  }

  private async prune() {
    if (Date.now() - this.lastPrune < 3_600_000) return;
    const cutoff = Date.now() - 7 * 86_400_000;
    await this.client.batch(
      [
        {
          sql: `UPDATE ${HEADS} SET pruned_through=MAX(pruned_through,COALESCE((SELECT MAX(sequence) FROM ${EVENTS}
        WHERE identity_id=${HEADS}.identity_id AND captured_at < ?),0))`,
          args: [cutoff],
        },
        { sql: `DELETE FROM ${EVENTS} WHERE captured_at < ?`, args: [cutoff] },
      ],
      'write',
    );
    this.lastPrune = Date.now();
  }

  async head(identityId: string) {
    if (this.disposed) throw new Error('Goal event source is closed');
    await this.prune();
    const result = await this.client.execute({
      sql: `SELECT pruned_through+1 AS first,last_sequence AS last
      FROM ${HEADS} WHERE identity_id=?`,
      args: [identityId],
    });
    return { first: Number(result.rows[0]?.first ?? 1), last: Number(result.rows[0]?.last ?? 0) };
  }

  async read(identityId: string, after: number) {
    if (this.disposed) throw new Error('Goal event source is closed');
    const result = await this.client.execute({
      sql: `SELECT * FROM ${EVENTS} WHERE identity_id=? AND sequence>? ORDER BY sequence LIMIT 100`,
      args: [identityId, after],
    });
    return result.rows.map(decodeGoalWorkflowChange);
  }

  async snapshot(identityId: string, runId: string) {
    if (this.disposed) throw new Error('Goal event source is closed');
    // A same-value UPDATE backfills only this owned row; it cannot overwrite a newer engine snapshot.
    await this.client.execute({
      sql: `UPDATE ${TABLE} SET snapshot=snapshot WHERE workflow_name='goal-create' AND run_id=? AND resourceId=?
      AND NOT EXISTS(SELECT 1 FROM ${STATES} WHERE identity_id=? AND run_id=?)`,
      args: [runId, identityId, identityId, runId],
    });
    const result = await this.client.execute({
      sql: `SELECT s.payload,s.current_actions,s.resource_version FROM ${STATES} s
      JOIN ${TABLE} w ON w.workflow_name='goal-create' AND w.run_id=s.run_id AND w.resourceId=s.identity_id WHERE s.identity_id=? AND s.run_id=?`,
      args: [identityId, runId],
    });
    const row = result.rows[0];
    return row
      ? decodeGoalEventState(row.payload, row.resource_version, row.current_actions)
      : null;
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        this.listeners.delete(listener);
      }
    }
  }
  subscribe(wake: () => void) {
    if (this.disposed) throw new Error('Goal event source is closed');
    this.listeners.add(wake);
    if (!this.timer)
      this.timer = setInterval(() => {
        void this.checkCommittedHead();
      }, 1000);
    return () => {
      this.listeners.delete(wake);
      if (!this.listeners.size && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }
  private async checkCommittedHead() {
    if (this.checking) return;
    this.checking = true;
    try {
      const result = await this.client.execute(
        `SELECT COALESCE(MAX(last_sequence),0) AS last FROM ${HEADS}`,
      );
      const last = Number(result.rows[0]?.last ?? 0);
      if (last !== this.lastGlobalSequence) {
        this.lastGlobalSequence = last;
        this.notify();
      }
    } catch {
      this.notify();
    } finally {
      this.checking = false;
    }
  }
  async dispose() {
    this.disposed = true;
    this.notify();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.listeners.clear();
  }
}
