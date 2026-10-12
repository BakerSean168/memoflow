import { randomUUID } from 'node:crypto';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { AssistantAttentionView } from '@memoflow/contracts/ai';
import {
  effectiveAssistantAttentionState,
  type AssistantAttentionAcknowledge,
  type AssistantAttentionIdentity,
  type AssistantAttentionLookup,
  type AssistantAttentionTransition,
  type IConversationAttentionPort,
} from '../../../application/ports/conversation-attention.port';

interface AttentionRow {
  id: string;
  identity_id: string;
  runtime_kind: string;
  conversation_id: string;
  run_id: string;
  run_sequence: number;
  state: string;
  revision: number;
  seen_revision: number;
  run_started_at: number;
  updated_at: number;
}

/** The Desktop Profile PowerSync table stays local for native Agent conversations. */
export class ConversationAttentionPowerSyncAdapter implements IConversationAttentionPort {
  constructor(private readonly db: IElectronDatabase) {}

  async transition(input: AssistantAttentionTransition): Promise<void> {
    // Transactionally serialized per local Profile; no read-modify-write races.
    await this.db.writeTransaction(async (tx) => {
      const old = await tx.getOptional<AttentionRow>(
        'SELECT * FROM ai_conversation_attention WHERE identity_id = ? AND runtime_kind = ? AND conversation_id = ?',
        [input.identityId, input.runtimeKind, input.conversationId],
      );
      const now = Date.now();
      if (!old) {
        await tx.execute(
          `INSERT INTO ai_conversation_attention
          (id, identity_id, runtime_kind, conversation_id, run_id, run_sequence, state, revision,
           seen_revision, run_started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            input.identityId,
            input.runtimeKind,
            input.conversationId,
            input.runId,
            input.sequence,
            input.state,
            1,
            0,
            input.occurredAt,
            now,
          ],
        );
        return;
      }
      const newRun = old.run_id !== input.runId;
      if (newRun && (input.state !== 'working' || input.occurredAt < old.run_started_at)) return;
      if (!newRun && input.sequence <= old.run_sequence) return;
      if (!newRun && ['done', 'failed', 'normal'].includes(old.state)) return;
      const changed = newRun || input.state !== old.state;
      await tx.execute(
        `UPDATE ai_conversation_attention
           SET run_id = ?, run_sequence = ?, state = ?, revision = ?, run_started_at = ?, updated_at = ?
           WHERE id = ? AND identity_id = ?`,
        [
          input.runId,
          input.sequence,
          input.state,
          old.revision + (changed ? 1 : 0),
          newRun ? input.occurredAt : old.run_started_at,
          now,
          old.id,
          input.identityId,
        ],
      );
    });
  }

  async heartbeat(input: AssistantAttentionIdentity & { runId: string }): Promise<void> {
    await this.db.execute(
      `UPDATE ai_conversation_attention SET updated_at = ?
       WHERE identity_id = ? AND runtime_kind = ? AND conversation_id = ?
         AND run_id = ? AND state IN ('working','input','approval')`,
      [Date.now(), input.identityId, input.runtimeKind, input.conversationId, input.runId],
    );
  }

  async list(input: AssistantAttentionLookup): Promise<AssistantAttentionView[]> {
    if (!input.conversationIds.length) return [];
    const ids = [...new Set(input.conversationIds)].slice(0, 100);
    const rows = await this.db.getAll<AttentionRow>(
      `SELECT * FROM ai_conversation_attention
       WHERE identity_id = ? AND runtime_kind = ?
         AND conversation_id IN (${ids.map(() => '?').join(',')})
       LIMIT 100`,
      [input.identityId, input.runtimeKind, ...ids],
    );
    const now = Date.now();
    return rows.map((row) => ({
      conversationId: row.conversation_id,
      runtimeKind: input.runtimeKind,
      state: effectiveAssistantAttentionState(
        {
          state: row.state as AssistantAttentionView['state'],
          revision: row.revision,
          seenRevision: row.seen_revision,
          updatedAt: row.updated_at,
        },
        now,
      ),
      revision: row.revision,
      seenRevision: row.seen_revision,
      runId: row.run_id,
      updatedAt: row.updated_at,
    }));
  }

  async acknowledge(input: AssistantAttentionAcknowledge): Promise<boolean> {
    const result = await this.db.execute(
      `UPDATE ai_conversation_attention SET seen_revision = ?
       WHERE identity_id = ? AND runtime_kind = ? AND conversation_id = ?
         AND revision >= ? AND seen_revision < ?`,
      [
        input.revision,
        input.identityId,
        input.runtimeKind,
        input.conversationId,
        input.revision,
        input.revision,
      ],
    );
    return result.rowsAffected === 1;
  }

  async forget(input: AssistantAttentionIdentity): Promise<void> {
    await this.db.execute(
      'DELETE FROM ai_conversation_attention WHERE identity_id = ? AND runtime_kind = ? AND conversation_id = ?',
      [input.identityId, input.runtimeKind, input.conversationId],
    );
  }
}
