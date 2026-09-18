import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { AIEventMap } from '@memoflow/contracts/ai';
import { AIConversation } from '../../../domain/aggregates/ai-conversation';
import type { IAIConversationRepository } from '../../../domain/repositories/i-ai-conversation-repository';
import { createTypedEventPublisher, eventBus, flushDomainEvents } from '@memoflow/utils/domain';
import { PowerSyncAIConversationMapper, type PowerSyncAIConversationRow } from './mappers';

const aiEventPublisher = createTypedEventPublisher<AIEventMap>(eventBus);

export class PowerSyncAIConversationRepository implements IAIConversationRepository {
  constructor(private readonly db: IElectronDatabase) {}

  async save(conversation: AIConversation): Promise<void> {
    const persisted = PowerSyncAIConversationMapper.toPersistence(conversation);
    await this.db.writeTransaction(async (tx) => {
      const existing = await tx.getOptional<{ id: string }>(
        `SELECT id FROM ai_conversations WHERE id = ? LIMIT 1`,
        [persisted.id],
      );
      if (existing) {
        await tx.execute(
          `UPDATE ai_conversations
           SET identity_id = ?, name = ?, status = ?, version = ?, updated_at = ?, deleted_at = ?
           WHERE id = ?`,
          [persisted.identity_id, persisted.name, persisted.status, persisted.version,
           persisted.updated_at, persisted.deleted_at, persisted.id],
        );
      } else {
        await tx.execute(
          `INSERT INTO ai_conversations (
             id, identity_id, name, status, version, created_at, updated_at, deleted_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [persisted.id, persisted.identity_id, persisted.name, persisted.status,
           persisted.version, persisted.created_at, persisted.updated_at, persisted.deleted_at],
        );
      }
    });
    flushDomainEvents(aiEventPublisher, conversation);
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<AIConversation | null> {
    const row = await this.db.getOptional<PowerSyncAIConversationRow>(
      `SELECT * FROM ai_conversations WHERE id = ? AND identity_id = ? AND deleted_at IS NULL LIMIT 1`,
      [id, identityId],
    );
    return row ? PowerSyncAIConversationMapper.toDomain(row) : null;
  }

  async findByIdentityId(identityId: string): Promise<AIConversation[]> {
    const rows = await this.db.getAll<PowerSyncAIConversationRow>(
      `SELECT * FROM ai_conversations WHERE identity_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [identityId],
    );
    return rows.map((row) => PowerSyncAIConversationMapper.toDomain(row));
  }

  async delete(identityId: string, id: string): Promise<void> {
    const existing = await this.findByIdForIdentity(identityId, id);
    if (!existing) throw new Error('Conversation not found for the current identity.');
    const now = new Date().toISOString();
    await this.db.execute(
      `UPDATE ai_conversations SET status = ?, deleted_at = ?, updated_at = ? WHERE id = ? AND identity_id = ?`,
      ['Archived', now, now, id, identityId],
    );
  }
}
