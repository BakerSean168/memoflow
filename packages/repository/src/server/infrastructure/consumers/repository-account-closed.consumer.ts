import type { PrismaClient } from '@memoflow/database';

export interface AccountClosedPayload {
  identityId: string;
  closedAt: number;
}

export class RepositoryAccountClosedConsumer {
  constructor(private readonly prisma: PrismaClient) {}

  async handleAccountClosed(event: AccountClosedPayload, eventId: string): Promise<void> {
    const consumerName = 'repository-account-closed';
    const existing = await this.prisma.inboxReceipt.findUnique({
      where: {
        id_consumer: {
          id: eventId,
          consumer: consumerName,
        },
      },
    });

    if (existing) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      // Cancel pending write requests for identity
      await tx.knowledgeWriteRequest.updateMany({
        where: {
          identityId: event.identityId,
          status: { in: ['PENDING', 'PROCESSING', 'QUEUED'] },
        },
        data: {
          status: 'CANCELLED',
          errorCode: 'ACCOUNT_CLOSED',
          errorMessage: 'Account closed',
          completedAt: new Date(),
        },
      });

      // Record durable InboxReceipt
      await tx.inboxReceipt.create({
        data: {
          id: eventId,
          consumer: consumerName,
          outcome: 'success',
          processedAt: new Date(),
        },
      });
    });
  }
}
