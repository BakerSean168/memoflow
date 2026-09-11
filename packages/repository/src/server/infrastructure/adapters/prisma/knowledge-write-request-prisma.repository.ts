import type { PrismaClient } from '@memoflow/database';
import type {
  IKnowledgeWriteRequestRepository,
  KnowledgeWriteRequestProjectionSource,
  KnowledgeWriteRequestRecord,
  KnowledgeWriteRequestStatus,
} from '../../../application/ports/knowledge-note-projection.repository';

type WriteRow = Awaited<ReturnType<PrismaClient['knowledgeWriteRequest']['findUnique']>>;

export class KnowledgeWriteRequestPrismaRepository implements IKnowledgeWriteRequestRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByIdentityAndRequestId(identityId: string, requestId: string) {
    return this.toRecord(
      await this.db.knowledgeWriteRequest.findUnique({
        where: { identityId_requestId: { identityId, requestId } },
      }),
    );
  }

  async findByIdForIdentity(identityId: string, id: string) {
    return this.toRecord(
      await this.db.knowledgeWriteRequest.findFirst({ where: { id, identityId } }),
    );
  }

  async create(record: KnowledgeWriteRequestRecord): Promise<boolean> {
    try {
      await this.db.knowledgeWriteRequest.create({
        data: {
          id: record.id,
          identityId: record.identityId,
          bindingId: record.connectionId,
          requestId: record.requestId,
          requestHash: record.requestHash,
          relativePath: record.relativePath,
          status: record.status,
          commitSha: record.commitSha,
          errorCode: record.errorCode,
          errorMessage: record.errorMessage,
          projectionStatus: record.projectionStatus,
          projectionErrorCode: record.projectionErrorCode,
          projectionErrorMessage: record.projectionErrorMessage,
          projectionAttempts: record.projectionAttempts,
          projectedAt: record.projectedAt ? new Date(record.projectedAt) : null,
          blobSha: record.blobSha,
          markdownContent: record.markdownContent,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt),
          completedAt: record.completedAt ? new Date(record.completedAt) : null,
        },
      });
      return true;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  async markCommitted(identityId: string, id: string, commitSha: string): Promise<void> {
    const updated = await this.db.knowledgeWriteRequest.updateMany({
      where: { id, identityId },
      data: {
        status: 'Committed',
        commitSha,
        errorCode: null,
        errorMessage: null,
        projectionStatus: 'Pending',
        projectionErrorCode: null,
        projectionErrorMessage: null,
        projectionAttempts: 0,
        projectedAt: null,
        completedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw new Error('Knowledge write request not found for the current identity.');
    }
  }

  async bindProjectionSource(
    identityId: string,
    id: string,
    source: KnowledgeWriteRequestProjectionSource,
  ): Promise<boolean> {
    // Guard: never regress an already Succeeded projection.
    const updated = await this.db.knowledgeWriteRequest.updateMany({
      where: { id, identityId, projectionStatus: { not: 'Succeeded' } },
      data: {
        blobSha: source.blobSha,
        markdownContent: source.markdownContent,
        projectionStatus: 'Pending',
        projectionErrorCode: null,
        projectionErrorMessage: null,
        projectionAttempts: 0,
        projectedAt: null,
      },
    });
    return updated.count === 1;
  }

  async markProjectionSucceeded(identityId: string, id: string, now: number): Promise<boolean> {
    // Only advance Pending/Failed -> Succeeded. An already Succeeded projection
    // is a no-op (idempotent, never regresses).
    const updated = await this.db.knowledgeWriteRequest.updateMany({
      where: { id, identityId, projectionStatus: { not: 'Succeeded' } },
      data: {
        projectionStatus: 'Succeeded',
        projectionErrorCode: null,
        projectionErrorMessage: null,
        projectionAttempts: { increment: 1 },
        projectedAt: new Date(now),
      },
    });
    return updated.count === 1;
  }

  async markProjectionFailed(
    identityId: string,
    id: string,
    code: string,
    message: string,
    _now: number,
  ): Promise<boolean> {
    // Never regress an already Succeeded projection to Failed.
    const updated = await this.db.knowledgeWriteRequest.updateMany({
      where: { id, identityId, projectionStatus: { not: 'Succeeded' } },
      data: {
        projectionStatus: 'Failed',
        projectionErrorCode: code,
        projectionErrorMessage: message,
        projectionAttempts: { increment: 1 },
        projectedAt: null,
      },
    });
    return updated.count === 1;
  }

  async markProjectionSucceededByCommit(
    connectionId: string,
    commitSha: string,
    now: number,
  ): Promise<number> {
    const updated = await this.db.knowledgeWriteRequest.updateMany({
      where: { bindingId: connectionId, commitSha, projectionStatus: { not: 'Succeeded' } },
      data: {
        projectionStatus: 'Succeeded',
        projectionErrorCode: null,
        projectionErrorMessage: null,
        projectionAttempts: { increment: 1 },
        projectedAt: new Date(now),
      },
    });
    return updated.count;
  }

  async listProjectionPendingOrFailedForConnection(
    connectionId: string,
    limit: number,
  ): Promise<KnowledgeWriteRequestRecord[]> {
    const rows = await this.db.knowledgeWriteRequest.findMany({
      where: {
        bindingId: connectionId,
        status: 'Committed',
        projectionStatus: { in: ['Pending', 'Failed'] },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    return rows
      .map((row) => this.toRecord(row)!)
      .filter((row): row is KnowledgeWriteRequestRecord => row !== null);
  }

  async listForIdentity(
    identityId: string,
    options: { connectionId?: string; limit: number },
  ): Promise<KnowledgeWriteRequestRecord[]> {
    const rows = await this.db.knowledgeWriteRequest.findMany({
      where: {
        identityId,
        ...(options.connectionId ? { bindingId: options.connectionId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit,
    });
    return rows
      .map((row) => this.toRecord(row)!)
      .filter((row): row is KnowledgeWriteRequestRecord => row !== null);
  }

  async retryFailed(identityId: string, id: string, updatedAt: number): Promise<boolean> {
    const updated = await this.db.knowledgeWriteRequest.updateMany({
      where: { id, identityId, status: 'Failed' },
      data: {
        status: 'Pending',
        commitSha: null,
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(updatedAt),
        completedAt: null,
      },
    });
    return updated.count === 1;
  }

  async markFailed(identityId: string, id: string, code: string, message: string): Promise<void> {
    const updated = await this.db.knowledgeWriteRequest.updateMany({
      where: { id, identityId },
      data: { status: 'Failed', errorCode: code, errorMessage: message },
    });
    if (updated.count !== 1) {
      throw new Error('Knowledge write request not found for the current identity.');
    }
  }

  private toRecord(row: WriteRow): KnowledgeWriteRequestRecord | null {
    if (!row) return null;
    return {
      id: row.id,
      identityId: row.identityId,
      connectionId: row.bindingId,
      requestId: row.requestId,
      requestHash: row.requestHash,
      relativePath: row.relativePath,
      status: row.status as KnowledgeWriteRequestStatus,
      commitSha: row.commitSha,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      projectionStatus: row.projectionStatus as KnowledgeWriteRequestRecord['projectionStatus'],
      projectionErrorCode: row.projectionErrorCode,
      projectionErrorMessage: row.projectionErrorMessage,
      projectionAttempts: row.projectionAttempts,
      projectedAt: row.projectedAt?.getTime() ?? null,
      blobSha: row.blobSha,
      markdownContent: row.markdownContent,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
      completedAt: row.completedAt?.getTime() ?? null,
    };
  }
}
