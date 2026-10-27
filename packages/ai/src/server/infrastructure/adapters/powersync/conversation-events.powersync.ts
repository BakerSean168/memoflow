import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/desktop-contracts';
import { AIConversationClientDTOSchema } from '@memoflow/ai-contracts';
import type {
  ConversationChange,
  ConversationEventSource,
} from '../../../domain/repositories/conversation-events.port';

const integer = z.coerce.number().int().nonnegative();
const positive = z.coerce.number().int().positive();
const sourceFields = (alias = '') => {
  const p = alias ? `${alias}.` : '';
  return `json_object('id',${p}id,'identity_id',${p}identity_id,'name',${p}name,'status',${p}status,'version',${p}version,'created_at',${p}created_at,'updated_at',${p}updated_at,'deleted_at',${p}deleted_at)`;
};
const nativeRow = z.object({
  id: z.string().min(1),
  identity_id: z.string().min(1),
  name: z.string(),
  status: z.string(),
  version: integer.nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  deleted_at: z.coerce.date().nullable(),
});
const stateRow = z.object({
  resource_version: positive,
  payload_json: z.string(),
  deleted: z.coerce.number().int().min(0).max(1),
});
const headRow = z.object({ sequence: integer, pruned_through: integer, last_pruned_at: integer });
const key = (identity: string, conversation: string) =>
  createHash('sha256')
    .update(JSON.stringify([identity, conversation]))
    .digest('hex');

/** Native mutations append inside their transaction; PowerSync hydration reconciles from committed rows. */
export class ConversationEventsPowerSync implements ConversationEventSource {
  private epochValue = '';
  private initializing: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private watcher: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  get epoch() {
    return this.epochValue;
  }
  constructor(private readonly db: IElectronDatabase) {}

  init(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Conversation event source is closed'));
    return (this.initializing ??= this.db.writeTransaction(async (tx) => {
      let row = await tx.getOptional<unknown>(
        "SELECT epoch FROM ai_conversation_event_metadata WHERE id='stream'",
      );
      if (!row) {
        row = { epoch: randomUUID() };
        await tx.execute(
          "INSERT INTO ai_conversation_event_metadata(id,epoch) VALUES('stream',?)",
          [z.object({ epoch: z.string().uuid() }).parse(row).epoch],
        );
      }
      this.epochValue = z.object({ epoch: z.string().uuid() }).parse(row).epoch;
    }));
  }

  /** Append only a safe summary in the same transaction as the native write. */
  async capture(
    tx: IElectronDatabaseTransaction,
    identityId: string,
    conversationId: string,
  ): Promise<void> {
    const id = key(identityId, conversationId);
    const raw = await tx.getOptional<unknown>(
      `SELECT *,${sourceFields()} AS source_json FROM ai_conversations WHERE identity_id=? AND id=?`,
      [identityId, conversationId],
    );
    const priorRaw = await tx.getOptional<unknown>(
      'SELECT resource_version,payload_json,deleted FROM ai_conversation_event_states WHERE id=?',
      [id],
    );
    const prior = priorRaw ? stateRow.parse(priorRaw) : null;
    if (!raw && (!prior || prior.deleted)) return;
    const row = raw ? nativeRow.parse(raw) : null;
    const sourceJson = raw ? z.object({ source_json: z.string() }).parse(raw).source_json : null;
    const payload = row
      ? JSON.stringify(
          AIConversationClientDTOSchema.parse({
            id: row.id,
            identityId: row.identity_id,
            name: row.name,
            status:
              row.status === 'ACTIVE'
                ? 'Active'
                : row.status === 'ARCHIVED'
                  ? 'Archived'
                  : row.status,
            version: row.version ?? 1,
            createdAt: row.created_at.getTime(),
            updatedAt: row.updated_at.getTime(),
            deletedAt: row.deleted_at?.getTime() ?? null,
          }),
        )
      : prior!.payload_json;
    const deleted = !row || row.deleted_at ? 1 : 0;
    const changed = !prior || prior.payload_json !== payload || prior.deleted !== deleted;
    const version = (prior?.resource_version ?? 0) + (changed ? 1 : 0);
    const values = [identityId, conversationId, version, payload, sourceJson, deleted];
    if (prior)
      await tx.execute(
        'UPDATE ai_conversation_event_states SET identity_id=?,conversation_id=?,resource_version=?,payload_json=?,source_json=?,deleted=? WHERE id=?',
        [...values, id],
      );
    else
      await tx.execute(
        'INSERT INTO ai_conversation_event_states(identity_id,conversation_id,resource_version,payload_json,source_json,deleted,id) VALUES(?,?,?,?,?,?,?)',
        [...values, id],
      );
    if (!changed) return;
    const headRaw = await tx.getOptional<unknown>(
      'SELECT sequence,pruned_through,last_pruned_at FROM ai_conversation_event_heads WHERE id=?',
      [identityId],
    );
    const head = headRaw ? headRow.parse(headRaw) : null;
    const sequence = (head?.sequence ?? 0) + 1;
    if (head)
      await tx.execute('UPDATE ai_conversation_event_heads SET sequence=? WHERE id=?', [
        sequence,
        identityId,
      ]);
    else
      await tx.execute(
        'INSERT INTO ai_conversation_event_heads(id,identity_id,sequence,pruned_through,last_pruned_at) VALUES(?,?,?,0,0)',
        [identityId, identityId, sequence],
      );
    await tx.execute(
      'INSERT INTO ai_conversation_event_log(id,identity_id,sequence,resource_version,payload_json,deleted,captured_at) VALUES(?,?,?,?,?,?,?)',
      [randomUUID(), identityId, sequence, version, payload, deleted, Date.now()],
    );
  }

  private async reconcile(identityId: string) {
    let count: number;
    do {
      count = await this.db.writeTransaction(async (tx) => {
        const changed = await tx.getAll<unknown>(
          `SELECT n.id AS conversation_id FROM ai_conversations n LEFT JOIN ai_conversation_event_states s
          ON s.identity_id=n.identity_id AND s.conversation_id=n.id WHERE n.identity_id=? AND (s.id IS NULL OR s.source_json IS NOT ${sourceFields('n')}) LIMIT 100`,
          [identityId],
        );
        const removed = await tx.getAll<unknown>(
          `SELECT s.conversation_id FROM ai_conversation_event_states s LEFT JOIN ai_conversations n
          ON n.identity_id=s.identity_id AND n.id=s.conversation_id WHERE s.identity_id=? AND s.deleted=0 AND n.id IS NULL LIMIT 100`,
          [identityId],
        );
        for (const raw of [...changed, ...removed])
          await this.capture(
            tx,
            identityId,
            z.object({ conversation_id: z.string().min(1) }).parse(raw).conversation_id,
          );
        return changed.length + removed.length;
      });
    } while (count >= 100);
  }

  async head(identityId: string) {
    if (this.disposed) throw new Error('Conversation event source is closed');
    await this.reconcile(identityId);
    return this.db.writeTransaction(async (tx) => {
      const raw = await tx.getOptional<unknown>(
        'SELECT sequence,pruned_through,last_pruned_at FROM ai_conversation_event_heads WHERE id=?',
        [identityId],
      );
      if (!raw) return { first: 1, last: 0 };
      const head = headRow.parse(raw);
      if (Date.now() - head.last_pruned_at >= 3_600_000) {
        const old = await tx.getAll<unknown>(
          'SELECT id,sequence FROM ai_conversation_event_log WHERE identity_id=? AND captured_at<? ORDER BY sequence LIMIT 1000',
          [identityId, Date.now() - 7 * 86_400_000],
        );
        for (const item of old) {
          const row = z.object({ id: z.string(), sequence: positive }).parse(item);
          head.pruned_through = Math.max(head.pruned_through, row.sequence);
          await tx.execute('DELETE FROM ai_conversation_event_log WHERE id=?', [row.id]);
        }
        await tx.execute(
          'UPDATE ai_conversation_event_heads SET pruned_through=?,last_pruned_at=? WHERE id=?',
          [head.pruned_through, old.length < 1000 ? Date.now() : head.last_pruned_at, identityId],
        );
      }
      return { first: head.pruned_through + 1, last: head.sequence };
    });
  }

  async read(identityId: string, after: number): Promise<ConversationChange[]> {
    if (this.disposed) throw new Error('Conversation event source is closed');
    await this.reconcile(identityId);
    const rows = await this.db.getAll<unknown>(
      'SELECT id,sequence,resource_version,payload_json,deleted FROM ai_conversation_event_log WHERE identity_id=? AND sequence>? ORDER BY sequence LIMIT 100',
      [identityId, after],
    );
    return rows.map((raw) => {
      const row = stateRow.extend({ id: z.string().uuid(), sequence: positive }).parse(raw);
      const view = AIConversationClientDTOSchema.parse(JSON.parse(row.payload_json));
      return {
        eventId: row.id,
        sequence: row.sequence,
        resourceVersion: row.resource_version,
        data: {
          conversationId: String(view.id),
          runtimeKind: 'builtin' as const,
          conversation: row.deleted ? null : { ...view, resourceVersion: row.resource_version },
        },
      };
    });
  }

  async snapshot(identityId: string, conversationIds: readonly string[]) {
    if (this.disposed) throw new Error('Conversation event source is closed');
    await this.init();
    if (conversationIds.length > 100) throw new Error('Conversation snapshot scope is too large');
    await this.reconcile(identityId);
    if (!conversationIds.length) return [];
    const rows = await this.db.getAll<unknown>(
      `SELECT resource_version,payload_json,deleted FROM ai_conversation_event_states WHERE identity_id=? AND conversation_id IN (${conversationIds.map(() => '?').join(',')}) AND deleted=0`,
      [identityId, ...conversationIds],
    );
    return rows.map((raw) => {
      const row = stateRow.parse(raw);
      return {
        ...AIConversationClientDTOSchema.parse(JSON.parse(row.payload_json)),
        resourceVersion: row.resource_version,
      };
    });
  }

  subscribe(wake: () => void) {
    if (this.disposed) throw new Error('Conversation event source is closed');
    if (!this.db.watch)
      throw new Error('Profile database does not support reactive Conversation queries');
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
        for await (const _result of this.db.watch!('SELECT id FROM ai_conversations LIMIT 1', [], {
          signal: controller.signal,
          comparator: { checkEquality: () => false },
        })) {
          if (controller.signal.aborted) break;
          this.wake();
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
  }
  private stopWatch() {
    this.watcher?.abort();
    this.watcher = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
  async dispose() {
    this.disposed = true;
    this.wake();
    this.listeners.clear();
    this.stopWatch();
  }
}
