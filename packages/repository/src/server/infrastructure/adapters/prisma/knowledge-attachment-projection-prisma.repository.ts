import type { PrismaClient } from '@memoflow/database';
import type { KnowledgeAttachmentProjectionClientDTO } from '@memoflow/contracts/repository';
import type {
  IKnowledgeAttachmentProjectionRepository,
  KnowledgeAttachmentProjectionUpsert,
} from '../../../application/ports/knowledge-attachment-projection.repository';

type ProjectionRow = Awaited<
  ReturnType<PrismaClient['knowledgeAttachmentProjection']['findUnique']>
>;

export class KnowledgeAttachmentProjectionPrismaRepository implements IKnowledgeAttachmentProjectionRepository {
  constructor(private readonly db: PrismaClient) {}

  async applySnapshot(
    connectionId: string,
    commitSha: string,
    attachments: KnowledgeAttachmentProjectionUpsert[],
  ): Promise<void> {
    const paths = attachments.map((attachment) => attachment.relativePath);
    await this.upsertMany(attachments);
    await this.db.knowledgeAttachmentProjection.updateMany({
      where: {
        bindingId: connectionId,
        deletedAt: null,
        ...(paths.length ? { relativePath: { notIn: paths } } : {}),
      },
      data: { deletedAt: new Date(), commitSha },
    });
  }

  async applyChanges(
    connectionId: string,
    commitSha: string,
    attachments: KnowledgeAttachmentProjectionUpsert[],
    deletedPaths: string[],
  ): Promise<void> {
    await this.upsertMany(attachments);
    if (deletedPaths.length) {
      await this.db.knowledgeAttachmentProjection.updateMany({
        where: { bindingId: connectionId, relativePath: { in: [...new Set(deletedPaths)] } },
        data: { deletedAt: new Date(), commitSha },
      });
    }
  }

  async listByIdentity(
    identityId: string,
    options: { connectionId?: string; query?: string; limit: number },
  ): Promise<KnowledgeAttachmentProjectionClientDTO[]> {
    const query = options.query?.trim();
    const rows = await this.db.knowledgeAttachmentProjection.findMany({
      where: {
        binding: { identityId, disconnectedAt: null },
        bindingId: options.connectionId,
        deletedAt: null,
        ...(query ? { relativePath: { contains: query, mode: 'insensitive' } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: options.limit,
    });
    return rows.map((row) => this.toClient(row));
  }

  async findByIdForIdentity(
    identityId: string,
    projectionId: string,
  ): Promise<KnowledgeAttachmentProjectionClientDTO | null> {
    return this.toClientOrNull(
      await this.db.knowledgeAttachmentProjection.findFirst({
        where: {
          id: projectionId,
          deletedAt: null,
          binding: { identityId, disconnectedAt: null },
        },
      }),
    );
  }

  private async upsertMany(attachments: KnowledgeAttachmentProjectionUpsert[]): Promise<void> {
    for (const attachment of attachments) {
      await this.db.knowledgeAttachmentProjection.upsert({
        where: {
          bindingId_relativePath: {
            bindingId: attachment.connectionId,
            relativePath: attachment.relativePath,
          },
        },
        create: {
          id: attachment.id,
          bindingId: attachment.connectionId,
          relativePath: attachment.relativePath,
          commitSha: attachment.commitSha,
          blobSha: attachment.blobSha,
          byteSize: attachment.byteSize,
          mediaType: attachment.mediaType,
        },
        update: {
          commitSha: attachment.commitSha,
          blobSha: attachment.blobSha,
          byteSize: attachment.byteSize,
          mediaType: attachment.mediaType,
          deletedAt: null,
        },
      });
    }
  }

  private toClientOrNull(row: ProjectionRow): KnowledgeAttachmentProjectionClientDTO | null {
    return row ? this.toClient(row) : null;
  }

  private toClient(row: NonNullable<ProjectionRow>): KnowledgeAttachmentProjectionClientDTO {
    return {
      id: row.id,
      connectionId: row.bindingId,
      relativePath: row.relativePath,
      fileName: row.relativePath.split('/').slice(-1)[0] ?? row.relativePath,
      commitSha: row.commitSha,
      blobSha: row.blobSha,
      byteSize: row.byteSize,
      mediaType: row.mediaType,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
      deletedAt: row.deletedAt?.getTime() ?? null,
    };
  }
}
