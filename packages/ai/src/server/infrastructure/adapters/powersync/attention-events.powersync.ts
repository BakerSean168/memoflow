import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import {
  AssistantAttentionViewSchema,
  AssistantAttentionRuntimeKindSchema,
  AssistantAttentionStateSchema,
  type AssistantAttentionRuntimeKind,
} from '@memoflow/ai-contracts';
import type {
  AttentionChange,
  AttentionEventSource,
} from '../../../application/ports/attention-events.port';
import {
  ASSISTANT_ATTENTION_LEASE_MS,
  effectiveAssistantAttentionState,
} from '../../../application/ports/conversation-attention.port';

const integer = z.coerce.number().int().nonnegative();
const positive = z.coerce.number().int().positive();
const nativeRow = z.object({
  id: z.string().min(1),
  identity_id: z.string().min(1),
  conversation_id: z.string().min(1),
  runtime_kind: AssistantAttentionRuntimeKindSchema,
  run_id: z.string().nullable(),
  state: AssistantAttentionStateSchema,
  revision: positive,
  seen_revision: integer,
  updated_at: integer,
});
const stateRow = z.object({
  resource_version: positive,
  payload_json: z.string(),
  deleted: z.coerce.number().int().min(0).max(1),
});
const headRow = z.object({ sequence: integer, pruned_through: integer, last_pruned_at: integer });
const key = (identity: string, kind: string, conversation: string) =>
  createHash('sha256')
    .update(JSON.stringify([identity, kind, conversation]))
    .digest('hex');

/** Native mutations append inside their transaction; PowerSync hydration reconciles from committed rows. */
export class AttentionEventsPowerSync implements AttentionEventSource {
  private epochValue = '';
  private initializing: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private watcher: AbortController | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduling = false;
  private scheduleRequested = false;
  private disposed = false;
  get epoch() {
    return this.epochValue;
  }
  constructor(private readonly db: IElectronDatabase) {}

  init(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Attention event source is closed'));
    return (this.initializing ??= this.db.writeTransaction(async (tx) => {
      let row = await tx.getOptional<unknown>(
        "SELECT epoch FROM ai_attention_event_metadata WHERE id='stream'",
      );
      if (!row) {
        row = { epoch: randomUUID() };
        await tx.execute("INSERT INTO ai_attention_event_metadata(id,epoch) VALUES('stream',?)", [
          z.object({ epoch: z.string().uuid() }).parse(row).epoch,
        ]);
      }
      this.epochValue = z.object({ epoch: z.string().uuid() }).parse(row).epoch;
    }));
  }

  /** Called by the Attention owner before committing its native write. */
  async capture(
    tx: IElectronDatabaseTransaction,
    identityId: string,
    runtimeKind: AssistantAttentionRuntimeKind,
    conversationId: string,
  ): Promise<void> {
    const id = key(identityId, runtimeKind, conversationId);
    const raw = await tx.getOptional<unknown>(
      'SELECT * FROM ai_conversation_attention WHERE identity_id=? AND runtime_kind=? AND conversation_id=?',
      [identityId, runtimeKind, conversationId],
    );
    const priorRaw = await tx.getOptional<unknown>(
      'SELECT resource_version,payload_json,deleted FROM ai_attention_event_states WHERE id=?',
      [id],
    );
    const prior = priorRaw ? stateRow.parse(priorRaw) : null;
    if (!raw && (!prior || prior.deleted)) return;
    const row = raw ? nativeRow.parse(raw) : null;
    const now = Date.now();
    const expired = Boolean(
      row &&
      ['working', 'input', 'approval'].includes(row.state) &&
      now - row.updated_at > ASSISTANT_ATTENTION_LEASE_MS,
    );
    const deadline =
      row && ['working', 'input', 'approval'].includes(row.state)
        ? row.updated_at + ASSISTANT_ATTENTION_LEASE_MS
        : null;
    const payload = row
      ? JSON.stringify(
          AssistantAttentionViewSchema.parse({
            conversationId: row.conversation_id,
            runtimeKind: row.runtime_kind,
            runId: row.run_id,
            state: effectiveAssistantAttentionState(
              {
                state: row.state,
                revision: row.revision,
                seenRevision: row.seen_revision,
                updatedAt: row.updated_at,
              },
              now,
            ),
            revision: row.revision,
            seenRevision: row.seen_revision,
            updatedAt: row.updated_at,
          }),
        )
      : prior!.payload_json;
    const deleted = row ? 0 : 1;
    const changed = !prior || prior.payload_json !== payload || prior.deleted !== deleted;
    const version = (prior?.resource_version ?? 0) + (changed ? 1 : 0);
    const values = [
      identityId,
      runtimeKind,
      conversationId,
      row?.id ?? null,
      version,
      row?.state ?? null,
      row?.revision ?? null,
      row?.seen_revision ?? null,
      row?.run_id ?? null,
      row?.updated_at ?? null,
      deadline,
      expired ? 1 : 0,
      deleted,
      payload,
    ];
    if (prior)
      await tx.execute(
        `UPDATE ai_attention_event_states SET identity_id=?,runtime_kind=?,conversation_id=?,owner_row_id=?,resource_version=?,source_state=?,source_revision=?,seen_revision=?,run_id=?,updated_at=?,expires_at=?,expired=?,deleted=?,payload_json=? WHERE id=?`,
        [...values, id],
      );
    else
      await tx.execute(
        `INSERT INTO ai_attention_event_states(identity_id,runtime_kind,conversation_id,owner_row_id,resource_version,source_state,source_revision,seen_revision,run_id,updated_at,expires_at,expired,deleted,payload_json,id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [...values, id],
      );
    if (!changed) return;
    const headRaw = await tx.getOptional<unknown>(
      'SELECT sequence,pruned_through,last_pruned_at FROM ai_attention_event_heads WHERE id=?',
      [identityId],
    );
    const head = headRaw ? headRow.parse(headRaw) : null;
    const sequence = (head?.sequence ?? 0) + 1;
    if (head)
      await tx.execute('UPDATE ai_attention_event_heads SET sequence=? WHERE id=?', [
        sequence,
        identityId,
      ]);
    else
      await tx.execute(
        'INSERT INTO ai_attention_event_heads(id,identity_id,sequence,pruned_through,last_pruned_at) VALUES(?,?,?,0,0)',
        [identityId, identityId, sequence],
      );
    await tx.execute(
      'INSERT INTO ai_attention_event_log(id,identity_id,sequence,resource_version,payload_json,deleted,captured_at) VALUES(?,?,?,?,?,?,?)',
      [randomUUID(), identityId, sequence, version, payload, deleted, now],
    );
  }

  private async reconcile(identityId: string) {
    let count: number;
    do {
      count = await this.db.writeTransaction(async (tx) => {
        const now = Date.now();
        const changed = await tx.getAll<unknown>(
          `SELECT n.runtime_kind,n.conversation_id FROM ai_conversation_attention n LEFT JOIN ai_attention_event_states s
          ON s.identity_id=n.identity_id AND s.runtime_kind=n.runtime_kind AND s.conversation_id=n.conversation_id
          WHERE n.identity_id=? AND (s.id IS NULL OR s.deleted=1 OR s.owner_row_id<>n.id OR s.source_state<>n.state OR s.source_revision<>n.revision
            OR s.seen_revision<>n.seen_revision OR s.updated_at<>n.updated_at OR s.run_id IS NOT n.run_id
            OR s.expired<>CASE WHEN n.state IN ('working','input','approval') AND n.updated_at+? < ? THEN 1 ELSE 0 END) LIMIT 100`,
          [identityId, ASSISTANT_ATTENTION_LEASE_MS, now],
        );
        const removed = await tx.getAll<unknown>(
          `SELECT s.runtime_kind,s.conversation_id FROM ai_attention_event_states s LEFT JOIN ai_conversation_attention n
          ON s.identity_id=n.identity_id AND s.runtime_kind=n.runtime_kind AND s.conversation_id=n.conversation_id WHERE s.identity_id=? AND s.deleted=0 AND n.id IS NULL LIMIT 100`,
          [identityId],
        );
        for (const item of [...changed, ...removed]) {
          const identifiers = z
            .object({
              runtime_kind: AssistantAttentionRuntimeKindSchema,
              conversation_id: z.string().min(1),
            })
            .parse(item);
          await this.capture(tx, identityId, identifiers.runtime_kind, identifiers.conversation_id);
        }
        return changed.length + removed.length;
      });
    } while (count >= 100);
    if (this.listeners.size) void this.scheduleExpiry();
  }

  async head(identityId: string) {
    if (this.disposed) throw new Error('Attention event source is closed');
    await this.reconcile(identityId);
    return this.db.writeTransaction(async (tx) => {
      const raw = await tx.getOptional<unknown>(
        'SELECT sequence,pruned_through,last_pruned_at FROM ai_attention_event_heads WHERE id=?',
        [identityId],
      );
      if (!raw) return { first: 1, last: 0 };
      const head = headRow.parse(raw);
      if (Date.now() - head.last_pruned_at >= 3_600_000) {
        const old = await tx.getAll<unknown>(
          'SELECT id,sequence FROM ai_attention_event_log WHERE identity_id=? AND captured_at<? ORDER BY sequence LIMIT 1000',
          [identityId, Date.now() - 7 * 86_400_000],
        );
        for (const item of old) {
          const row = z.object({ id: z.string(), sequence: positive }).parse(item);
          head.pruned_through = Math.max(head.pruned_through, row.sequence);
          await tx.execute('DELETE FROM ai_attention_event_log WHERE id=?', [row.id]);
        }
        await tx.execute(
          'UPDATE ai_attention_event_heads SET pruned_through=?,last_pruned_at=? WHERE id=?',
          [head.pruned_through, old.length < 1000 ? Date.now() : head.last_pruned_at, identityId],
        );
      }
      return { first: head.pruned_through + 1, last: head.sequence };
    });
  }

  async read(identityId: string, after: number): Promise<AttentionChange[]> {
    if (this.disposed) throw new Error('Attention event source is closed');
    await this.reconcile(identityId);
    const rows = await this.db.getAll<unknown>(
      'SELECT id,sequence,resource_version,payload_json,deleted FROM ai_attention_event_log WHERE identity_id=? AND sequence>? ORDER BY sequence LIMIT 100',
      [identityId, after],
    );
    return rows.map((raw) => {
      const row = stateRow.extend({ id: z.string().uuid(), sequence: positive }).parse(raw);
      const view = AssistantAttentionViewSchema.parse(JSON.parse(row.payload_json));
      return {
        eventId: row.id,
        sequence: row.sequence,
        resourceVersion: row.resource_version,
        data: {
          conversationId: view.conversationId,
          runtimeKind: view.runtimeKind,
          attention: row.deleted ? null : { ...view, resourceVersion: row.resource_version },
        },
      };
    });
  }

  async snapshot(
    identityId: string,
    conversationIds: readonly string[],
    runtimeKind: AssistantAttentionRuntimeKind,
  ) {
    if (this.disposed) throw new Error('Attention event source is closed');
    if (conversationIds.length > 100) throw new Error('Attention snapshot scope is too large');
    await this.reconcile(identityId);
    if (!conversationIds.length) return [];
    const rows = await this.db.getAll<unknown>(
      `SELECT resource_version,payload_json,deleted FROM ai_attention_event_states WHERE identity_id=? AND runtime_kind=? AND conversation_id IN (${conversationIds.map(() => '?').join(',')}) AND deleted=0`,
      [identityId, runtimeKind, ...conversationIds],
    );
    return rows.map((raw) => {
      const row = stateRow.parse(raw);
      return {
        ...AssistantAttentionViewSchema.parse(JSON.parse(row.payload_json)),
        resourceVersion: row.resource_version,
      };
    });
  }

  subscribe(wake: () => void) {
    if (this.disposed) throw new Error('Attention event source is closed');
    if (!this.db.watch)
      throw new Error('Profile database does not support reactive Attention queries');
    this.listeners.add(wake);
    if (!this.watcher) this.startWatch();
    return () => {
      this.listeners.delete(wake);
      if (!this.listeners.size) this.stopWatch();
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
  private startWatch() {
    const controller = new AbortController();
    this.watcher = controller;
    void (async () => {
      try {
        for await (const _result of this.db.watch!(
          'SELECT id FROM ai_conversation_attention LIMIT 1',
          [],
          { signal: controller.signal, comparator: { checkEquality: () => false } },
        )) {
          if (controller.signal.aborted) break;
          this.wake();
          void this.scheduleExpiry();
        }
      } catch {
        if (!controller.signal.aborted) this.wake();
      } finally {
        if (this.watcher === controller) {
          this.watcher = null;
          if (!this.disposed && this.listeners.size)
            this.retryTimer = setTimeout(() => {
              this.retryTimer = null;
              this.startWatch();
            }, 1000);
        }
      }
    })();
    void this.scheduleExpiry();
  }
  private async scheduleExpiry() {
    this.scheduleRequested = true;
    if (this.scheduling) return;
    this.scheduling = true;
    try {
      do {
        this.scheduleRequested = false;
        const row = await this.db.getOptional<unknown>(
          'SELECT MIN(expires_at) AS deadline FROM ai_attention_event_states WHERE deleted=0 AND expired=0',
        );
        const deadline = z.object({ deadline: integer.nullable() }).parse(row).deadline;
        if (this.disposed || !this.listeners.size) return;
        if (this.expiryTimer) clearTimeout(this.expiryTimer);
        this.expiryTimer =
          deadline === null
            ? null
            : setTimeout(
                () => {
                  this.expiryTimer = null;
                  void (async () => {
                    const identities = await this.db.getAll<unknown>(
                      'SELECT DISTINCT identity_id FROM ai_attention_event_states WHERE deleted=0 AND expired=0 AND expires_at<? LIMIT 100',
                      [Date.now()],
                    );
                    for (const raw of identities)
                      await this.reconcile(
                        z.object({ identity_id: z.string() }).parse(raw).identity_id,
                      );
                    this.wake();
                    await this.scheduleExpiry();
                  })().catch(() => this.wake());
                },
                Math.max(5, Math.min(deadline - Date.now(), 2_147_483_647)),
              );
      } while (this.scheduleRequested);
    } catch {
      this.wake();
    } finally {
      this.scheduling = false;
    }
  }
  private stopWatch() {
    this.watcher?.abort();
    this.watcher = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.retryTimer = null;
    this.expiryTimer = null;
  }
  async dispose() {
    this.disposed = true;
    this.wake();
    this.listeners.clear();
    this.stopWatch();
  }
}
