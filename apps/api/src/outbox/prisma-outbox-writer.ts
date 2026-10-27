import type { PrismaClient } from '@memoflow/database';
import type { IOutboxWriter, OutboxEnqueueInput } from '@memoflow/patterns';
import {
  createCorrelationId,
  createMessageId,
  type MessageId,
} from '@memoflow/shared-primitives/command';

/**
 * Prisma OutboxWriter adapter（R1-2 接线示范）。
 *
 * 聚合仓储事件总线发布失败时，事件落入 reliable_outbox_messages 表
 * （durable、可重试、可对账）。当前写入 status='pending'；投递/退避
 * dispatcher 与 retry 在 R2+ 迁移时实现。
 */
export class PrismaOutboxWriter implements IOutboxWriter {
  constructor(private readonly db: PrismaClient) {}

  async enqueue(input: OutboxEnqueueInput): Promise<MessageId> {
    const messageId = input.messageId ?? createMessageId();
    await this.db.outboxMessage.create({
      data: {
        id: messageId,
        identityId: input.identityId ?? null,
        messageType: input.messageType,
        schemaVersion: input.schemaVersion ?? 1,
        correlationId: input.correlationId ?? createCorrelationId(),
        causationId: input.causationId ?? null,
        payloadJson: input.payloadJson,
        status: 'pending',
        attempts: 0,
        availableAt: new Date(),
        lastError: null,
        dispatchedAt: null,
      },
    });
    return messageId;
  }
}
