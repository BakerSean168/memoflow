import type { PrismaClient } from '@memoflow/database';

// Structural consumer shape (boundary: scope:account must not import
// scope:reminder/scope:notification libs; real consumers injected at composition root).
export interface AccountClosedConsumerLike {
  handleAccountClosed(event: unknown, eventId: string): Promise<void>;
}

export class AccountClosedWorker {
  private readonly routineConsumer: AccountClosedConsumerLike;
  private readonly notificationConsumer: AccountClosedConsumerLike;
  private readonly repositoryConsumer?: AccountClosedConsumerLike;
  private readonly leaseDurationMs: number;
  private readonly enableHeartbeat: boolean;

  constructor(
    private readonly prisma: PrismaClient,
    options: {
      routineConsumer: AccountClosedConsumerLike;
      notificationConsumer: AccountClosedConsumerLike;
      repositoryConsumer?: AccountClosedConsumerLike;
      leaseDurationMs?: number;
      enableHeartbeat?: boolean;
    },
  ) {
    this.routineConsumer = options.routineConsumer;
    this.notificationConsumer = options.notificationConsumer;
    this.repositoryConsumer = options.repositoryConsumer;
    this.leaseDurationMs = options.leaseDurationMs ?? 30000;
    this.enableHeartbeat = options.enableHeartbeat ?? true;
  }

  async processPendingMessages(limit = 10): Promise<number> {
    let processedCount = 0;

    for (let i = 0; i < limit; i++) {
      const workerToken = crypto.randomUUID();
      const now = new Date();
      const leaseDurationMs = this.leaseDurationMs;
      const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

      const candidate = await this.prisma.outboxMessage.findFirst({
        where: {
          messageType: 'account:closed',
          status: 'pending',
          OR: [
            { ownerToken: null },
            { leaseExpiresAt: { lt: now } },
          ],
        },
        select: { id: true },
      });

      if (!candidate) {
        break;
      }

      const claimResult = await this.prisma.outboxMessage.updateMany({
        where: {
          id: candidate.id,
          status: 'pending',
          OR: [
            { ownerToken: null },
            { leaseExpiresAt: { lt: now } },
          ],
        },
        data: {
          ownerToken: workerToken,
          leaseExpiresAt,
        },
      });

      if (claimResult.count === 0) {
        continue;
      }

      const msg = await this.prisma.outboxMessage.findUnique({
        where: { id: candidate.id },
      });

      if (!msg || msg.ownerToken !== workerToken) {
        continue;
      }

      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      if (this.enableHeartbeat) {
        const intervalMs = Math.max(50, Math.floor(leaseDurationMs / 3));

        heartbeatTimer = setInterval(async () => {
          try {
            const currentTime = new Date();
            const nextLease = new Date(currentTime.getTime() + leaseDurationMs);
            const res = await this.prisma.outboxMessage.updateMany({
              where: { id: msg.id, ownerToken: workerToken, status: 'pending' },
              data: {
                leaseExpiresAt: nextLease,
                lastHeartbeatAt: currentTime,
              },
            });
            if (res.count === 0 && heartbeatTimer) {
              clearInterval(heartbeatTimer);
              heartbeatTimer = null;
            }
          } catch {
            if (heartbeatTimer) {
              clearInterval(heartbeatTimer);
              heartbeatTimer = null;
            }
          }
        }, intervalMs);
      }

      try {
        const eventPayload = JSON.parse(msg.payloadJson);
        const eventId = msg.idempotencyKey ?? msg.id;

        await this.routineConsumer.handleAccountClosed(eventPayload, eventId);
        await this.notificationConsumer.handleAccountClosed(eventPayload, eventId);
        if (this.repositoryConsumer) {
          await this.repositoryConsumer.handleAccountClosed(eventPayload, eventId);
        }

        const updateRes = await this.prisma.outboxMessage.updateMany({
          where: { id: msg.id, ownerToken: workerToken, status: 'pending' },
          data: {
            status: 'dispatched',
            dispatchedAt: new Date(),
            ownerToken: null,
            leaseExpiresAt: null,
          },
        });

        if (updateRes.count > 0) {
          processedCount++;
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await this.prisma.outboxMessage.updateMany({
          where: { id: msg.id, ownerToken: workerToken, status: 'pending' },
          data: {
            attempts: { increment: 1 },
            lastError: errorMsg,
            ownerToken: null,
            leaseExpiresAt: null,
          },
        });
      } finally {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      }
    }

    return processedCount;
  }
}
