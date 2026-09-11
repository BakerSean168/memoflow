import type { PrismaClient } from '@memoflow/database';
import type {
  KnowledgeNoteProjectionClientDTO,
  KnowledgeNoteProjectionIndexStatus,
} from '@memoflow/contracts/repository';
import type {
  IKnowledgeNoteProjectionRepository,
  KnowledgeNoteProjectionDeletion,
  KnowledgeNoteProjectionUpsert,
} from '../../../application/ports/knowledge-note-projection.repository';

type ProjectionRow = Awaited<ReturnType<PrismaClient['knowledgeNoteProjection']['findUnique']>>;

export class KnowledgeNoteProjectionPrismaRepository implements IKnowledgeNoteProjectionRepository {
  constructor(private readonly db: PrismaClient) {}

  async applySnapshot(
    connectionId: string,
    commitSha: string,
    notes: KnowledgeNoteProjectionUpsert[],
  ): Promise<KnowledgeNoteProjectionDeletion[]> {
    const paths = notes.map((note) => note.relativePath);
    const deleted = await this.db.knowledgeNoteProjection.findMany({
      where: {
        bindingId: connectionId,
        deletedAt: null,
        ...(paths.length ? { relativePath: { notIn: paths } } : {}),
      },
      select: { id: true, relativePath: true },
    });
    await this.upsertMany(notes);
    await this.db.knowledgeNoteProjection.updateMany({
      where: {
        bindingId: connectionId,
        deletedAt: null,
        ...(paths.length ? { relativePath: { notIn: paths } } : {}),
      },
      data: { deletedAt: new Date(), commitSha, indexStatus: 'pending' },
    });
    return deleted satisfies KnowledgeNoteProjectionDeletion[];
  }

  async applyChanges(
    connectionId: string,
    commitSha: string,
    notes: KnowledgeNoteProjectionUpsert[],
    deletedPaths: string[],
  ): Promise<void> {
    await this.upsertMany(notes);
    if (deletedPaths.length) {
      await this.db.knowledgeNoteProjection.updateMany({
        where: { bindingId: connectionId, relativePath: { in: [...new Set(deletedPaths)] } },
        data: { deletedAt: new Date(), commitSha, indexStatus: 'pending' },
      });
    }
  }

  async listByIdentity(
    identityId: string,
    options: { connectionId?: string; query?: string; limit: number },
  ): Promise<KnowledgeNoteProjectionClientDTO[]> {
    const query = options.query?.trim();
    const rows = await this.db.knowledgeNoteProjection.findMany({
      where: {
        binding: { identityId, disconnectedAt: null },
        bindingId: options.connectionId,
        deletedAt: null,
        ...(query
          ? {
              OR: [
                { relativePath: { contains: query, mode: 'insensitive' } },
                { markdownContent: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: options.limit,
    });
    return rows.map((row) => this.toClient(row));
  }

  async findByIdForIdentity(
    identityId: string,
    projectionId: string,
  ): Promise<KnowledgeNoteProjectionClientDTO | null> {
    return this.toClientOrNull(
      await this.db.knowledgeNoteProjection.findFirst({
        where: {
          id: projectionId,
          deletedAt: null,
          binding: { identityId, disconnectedAt: null },
        },
      }),
    );
  }

  async findByPath(
    connectionId: string,
    relativePath: string,
  ): Promise<KnowledgeNoteProjectionClientDTO | null> {
    return this.toClientOrNull(
      await this.db.knowledgeNoteProjection.findUnique({
        where: { bindingId_relativePath: { bindingId: connectionId, relativePath } },
      }),
    );
  }

  async loadLinkGraphSourcesForIdentity(
    identityId: string,
    centerProjectionId: string,
    limit: number,
  ) {
    const center = await this.db.knowledgeNoteProjection.findFirst({
      where: {
        id: centerProjectionId,
        deletedAt: null,
        binding: { identityId, disconnectedAt: null },
      },
    });
    if (!center) return null;
    const others = await this.db.knowledgeNoteProjection.findMany({
      where: {
        bindingId: center.bindingId,
        id: { not: center.id },
        deletedAt: null,
      },
      orderBy: { relativePath: 'asc' },
      take: limit,
    });
    const truncated = others.length >= limit;
    return {
      notes: [center, ...others.slice(0, Math.max(0, limit - 1))].map((row) => this.toClient(row)),
      truncated,
    };
  }

  async updateIndexStatusForIdentity(
    identityId: string,
    projectionId: string,
    expectedContentHash: string,
    status: KnowledgeNoteProjectionIndexStatus,
  ): Promise<boolean> {
    const updated = await this.db.knowledgeNoteProjection.updateMany({
      where: {
        id: projectionId,
        contentHash: expectedContentHash,
        deletedAt: null,
        binding: { identityId, disconnectedAt: null },
      },
      data: { indexStatus: status },
    });
    return updated.count === 1;
  }

  private async upsertMany(notes: KnowledgeNoteProjectionUpsert[]): Promise<void> {
    for (const note of notes) {
      await this.db.knowledgeNoteProjection.upsert({
        where: {
          bindingId_relativePath: {
            bindingId: note.connectionId,
            relativePath: note.relativePath,
          },
        },
        create: {
          id: note.id,
          bindingId: note.connectionId,
          relativePath: note.relativePath,
          commitSha: note.commitSha,
          blobSha: note.blobSha,
          contentHash: note.contentHash,
          markdownContent: note.markdownContent,
          indexStatus: note.indexStatus,
          frontmatter: note.frontmatter as never,
        },
        update: {
          commitSha: note.commitSha,
          blobSha: note.blobSha,
          contentHash: note.contentHash,
          frontmatter: note.frontmatter as never,
          markdownContent: note.markdownContent,
          indexStatus: note.indexStatus,
          deletedAt: null,
        },
      });
    }
  }

  private toClientOrNull(row: ProjectionRow): KnowledgeNoteProjectionClientDTO | null {
    return row ? this.toClient(row) : null;
  }

  private toClient(row: NonNullable<ProjectionRow>): KnowledgeNoteProjectionClientDTO {
    const frontmatter =
      row.frontmatter && typeof row.frontmatter === 'object' && !Array.isArray(row.frontmatter)
        ? (row.frontmatter as Record<string, unknown>)
        : {};
    const title =
      typeof frontmatter['title'] === 'string' && frontmatter['title'].trim()
        ? frontmatter['title'].trim()
        : row.relativePath.split('/').slice(-1)[0]?.replace(/\.md$/i, '') || row.relativePath;
    return {
      id: row.id,
      connectionId: row.bindingId,
      relativePath: row.relativePath,
      title,
      commitSha: row.commitSha,
      blobSha: row.blobSha,
      contentHash: row.contentHash,
      frontmatter,
      markdownContent: row.markdownContent,
      indexStatus: row.indexStatus as KnowledgeNoteProjectionClientDTO['indexStatus'],
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
      deletedAt: row.deletedAt?.getTime() ?? null,
    };
  }
}
