import type { PrismaClient } from '@memoflow/database';
import type {
  GithubWebhookDeliveryRecord,
  GithubWebhookDeliveryStatus,
  IGithubWebhookDeliveryRepository,
} from '../../../application/ports/knowledge-note-projection.repository';

type DeliveryRow = Awaited<ReturnType<PrismaClient['githubWebhookDelivery']['findUnique']>>;

export class GithubWebhookDeliveryPrismaRepository implements IGithubWebhookDeliveryRepository {
  constructor(private readonly db: PrismaClient) {}

  async reserve(record: GithubWebhookDeliveryRecord): Promise<boolean> {
    try {
      await this.db.githubWebhookDelivery.create({
        data: {
          id: record.id,
          bindingId: record.connectionId,
          deliveryId: record.deliveryId,
          eventName: record.eventName,
          beforeSha: record.beforeSha,
          afterSha: record.afterSha,
          forced: record.forced,
          status: record.status,
          errorMessage: record.errorMessage,
          receivedAt: new Date(record.receivedAt),
          processedAt: record.processedAt ? new Date(record.processedAt) : null,
        },
      });
      return true;
    } catch (error) {
      if (this.isUniqueConstraint(error)) return false;
      throw error;
    }
  }

  async findById(id: string): Promise<GithubWebhookDeliveryRecord | null> {
    return this.toRecord(await this.db.githubWebhookDelivery.findUnique({ where: { id } }));
  }

  async listPending(limit: number): Promise<GithubWebhookDeliveryRecord[]> {
    const rows = await this.db.githubWebhookDelivery.findMany({
      where: { status: { in: ['Received', 'Processing'] } },
      orderBy: { receivedAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => this.toRecord(row)!);
  }

  async updateStatus(
    id: string,
    connectionId: string,
    status: GithubWebhookDeliveryStatus,
    errorMessage: string | null = null,
  ): Promise<void> {
    const updated = await this.db.githubWebhookDelivery.updateMany({
      where: { id, bindingId: connectionId },
      data: {
        status,
        errorMessage,
        processedAt: ['Processed', 'Ignored', 'Failed'].includes(status) ? new Date() : null,
      },
    });
    if (updated.count !== 1) {
      throw new Error('GitHub webhook delivery not found for the current connection.');
    }
  }

  private toRecord(row: DeliveryRow): GithubWebhookDeliveryRecord | null {
    if (!row) return null;
    return {
      id: row.id,
      connectionId: row.bindingId,
      deliveryId: row.deliveryId,
      eventName: row.eventName,
      beforeSha: row.beforeSha,
      afterSha: row.afterSha,
      forced: row.forced,
      status: row.status as GithubWebhookDeliveryStatus,
      errorMessage: row.errorMessage,
      receivedAt: row.receivedAt.getTime(),
      processedAt: row.processedAt?.getTime() ?? null,
    };
  }

  private isUniqueConstraint(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
  }
}
