import type { PrismaClient } from '@memoflow/database';

export interface RoutineAccountClosedPayload {
  identityId: string;
  closedAt: number;
}

/**
 * Canonical Routine account-closure consumer.
 *
 * Account rows are retained during the closure saga, so Routine definitions are
 * explicitly disabled. Child Routine facts remain historical owner truth and
 * are removed later only by Account cascade if the account row is deleted.
 */
export class RoutineAccountClosedConsumer {
  constructor(private readonly prisma: PrismaClient) {}

  async handleAccountClosed(event: unknown, eventId: string): Promise<void> {
    const payload = event as RoutineAccountClosedPayload;
    if (!payload?.identityId) throw new TypeError('Routine account-closed event requires identityId');
    const consumer = 'routine-account-closed';
    const existing = await this.prisma.inboxReceipt.findUnique({
      where: { id_consumer: { id: eventId, consumer } },
    });
    if (existing) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.routineDefinition.updateMany({
        where: { identityId: payload.identityId, enabled: true },
        data: { enabled: false },
      });
      await tx.inboxReceipt.create({
        data: {
          id: eventId,
          consumer,
          outcome: 'success',
          processedAt: new Date(),
        },
      });
    });
  }
}
