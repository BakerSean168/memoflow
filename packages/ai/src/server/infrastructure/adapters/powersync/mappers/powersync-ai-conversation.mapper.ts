import type { ConversationStatus } from '@memoflow/contracts/ai';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { AIConversation } from '../../../../domain/aggregates/ai-conversation';
import { AiConversationId } from '../../../../domain/value-objects/ai-conversation-id';

export interface PowerSyncAIConversationRow {
  id: string;
  identity_id: string;
  name: string;
  status: string;
  version: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PowerSyncAIConversationWriteRow {
  id: string;
  identity_id: string;
  name: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Residual 1123 keep-boundary: string|null|undefined → Date|null (invalid → null; no now invent; no unknown).
// Soft residual 1123: utils toDate always-Date+now; portable toDateString → string|undefined (no force-merge).
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeConversationStatus(status: string): ConversationStatus {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'ARCHIVED') return 'Archived';
  return status as ConversationStatus;
}

export class PowerSyncAIConversationMapper {
  static toDomain(row: PowerSyncAIConversationRow): AIConversation {
    const createdAt = toDate(row.created_at) ?? new Date();
    const updatedAt = toDate(row.updated_at) ?? createdAt;
    return AIConversation.load({
      id: AiConversationId.of(row.id),
      identityId: IdentityId.of(row.identity_id),
      name: row.name,
      status: normalizeConversationStatus(row.status),
      version: row.version ?? 1,
      createdAt,
      updatedAt,
      deletedAt: toDate(row.deleted_at),
    });
  }

  static toPersistence(conversation: AIConversation): PowerSyncAIConversationWriteRow {
    const dto = conversation.toServerDTO();
    return {
      id: String(dto.id),
      identity_id: String(dto.identityId),
      name: dto.name,
      status: dto.status,
      version: dto.version,
      created_at: new Date(dto.createdAt).toISOString(),
      updated_at: new Date(dto.updatedAt).toISOString(),
      deleted_at: dto.deletedAt ? new Date(dto.deletedAt).toISOString() : null,
    };
  }
}
