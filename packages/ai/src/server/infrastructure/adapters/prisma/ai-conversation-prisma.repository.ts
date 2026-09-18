import type { PrismaClient, AiConversation as PrismaAiConversation } from '@memoflow/database';
import type { IAIConversationRepository } from '../../../domain';
import { AIConversation } from '../../../domain/aggregates/ai-conversation';
import type { AIEventMap } from '@memoflow/contracts/ai';
import { ConversationStatus } from '@memoflow/contracts/ai';
import { AiConversationId } from '../../../domain/value-objects/ai-conversation-id';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { createTypedEventPublisher, eventBus, flushDomainEvents } from '@memoflow/utils/domain';

const aiEventPublisher = createTypedEventPublisher<AIEventMap>(eventBus);

export class AIConversationPrismaRepository implements IAIConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(conversation: AIConversation): Promise<void> {
    const dto = conversation.toServerDTO();
    const existing = await this.prisma.aiConversation.findUnique({
      where: { id: String(dto.id) },
      select: { identityId: true },
    });
    if (existing && existing.identityId !== String(dto.identityId)) {
      throw new Error('Conversation not found for the current identity.');
    }
    await this.prisma.aiConversation.upsert({
      where: { id: String(dto.id) },
      create: {
        id: String(dto.id),
        identityId: String(dto.identityId),
        name: dto.name,
        status: dto.status,
        version: dto.version,
        createdAt: new Date(dto.createdAt),
        updatedAt: new Date(dto.updatedAt),
        deletedAt: dto.deletedAt != null ? new Date(dto.deletedAt) : null,
      },
      update: {
        name: dto.name,
        status: dto.status,
        version: dto.version,
        updatedAt: new Date(dto.updatedAt),
        deletedAt: dto.deletedAt != null ? new Date(dto.deletedAt) : null,
      },
    });
    flushDomainEvents(aiEventPublisher, conversation);
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<AIConversation | null> {
    const row = await this.prisma.aiConversation.findFirst({
      where: { id, identityId, deletedAt: null },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByIdentityId(identityId: string): Promise<AIConversation[]> {
    const rows = await this.prisma.aiConversation.findMany({
      where: { identityId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.toDomain(row));
  }

  async delete(identityId: string, id: string): Promise<void> {
    const updated = await this.prisma.aiConversation.updateMany({
      where: { id, identityId, deletedAt: null },
      data: { status: 'Archived', deletedAt: new Date() },
    });
    if (updated.count !== 1) throw new Error('Conversation not found for the current identity.');
  }

  private toDomain(row: PrismaAiConversation): AIConversation {
    return AIConversation.load({
      id: AiConversationId.of(row.id),
      identityId: IdentityId.of(row.identityId),
      name: row.name,
      status: row.status as ConversationStatus,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    });
  }
}
