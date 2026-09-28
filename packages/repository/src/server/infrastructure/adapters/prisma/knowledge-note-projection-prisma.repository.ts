import type { PrismaClient } from '@memoflow/database';
import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import type {
  KnowledgeNoteProjectionClientDTO,
  KnowledgeNoteProjectionListResponse,
  KnowledgeNoteProjectionSummaryDTO,
  KnowledgeNoteTreeNodeDTO,
  KnowledgeNoteTreeResponse,
  ListReferenceableKnowledgeDocumentsReq,
  ReferenceableKnowledgeDocumentListResponse,
  ReferenceableKnowledgeDocumentSummaryDTO,
} from '@memoflow/contracts/repository';
import type {
  IKnowledgeNoteProjectionRepository,
  KnowledgeNoteProjectionDeletion,
  KnowledgeNoteProjectionUpsert,
} from '../../../application/ports/knowledge-note-projection.repository';

type ProjectionRow = Awaited<ReturnType<PrismaClient['knowledgeNoteProjection']['findUnique']>>;

type ProjectionSummaryRow = {
  id: string;
  bindingId: string;
  knowledgeDocumentId: string | null;
  relativePath: string;
  contentHash: string;
  frontmatter: unknown;
  updatedAt: Date;
};

type SearchProjectionRow = ProjectionSummaryRow & {
  markdownContent: string;
};

type ReferenceableProjectionRow = ProjectionSummaryRow & {
  knowledgeDocumentId: string;
  binding: { knowledgeSpaceId: string };
};

type ReferenceableSearchProjectionRow = ReferenceableProjectionRow & {
  markdownContent: string;
};

const DEFAULT_HIDDEN_DIRECTORIES = ['node_modules', 'generated'] as const;

const treeCollator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
});

function normalizeSearchValue(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
}

function searchTerms(query: string): string[] {
  return [...new Set(query.normalize('NFKC').trim().split(/\s+/u).filter(Boolean))].slice(0, 8);
}

function frontmatterTitle(frontmatter: unknown): string {
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) return '';
  const title = (frontmatter as Record<string, unknown>)['title'];
  return typeof title === 'string' ? title.trim() : '';
}

function scoreSearchRow(row: SearchProjectionRow, query: string, terms: string[]): number {
  const normalizedQuery = normalizeSearchValue(query);
  const title = normalizeSearchValue(frontmatterTitle(row.frontmatter));
  const path = normalizeSearchValue(row.relativePath);
  const body = normalizeSearchValue(row.markdownContent);
  const pathSegments = path.split('/');
  const basename = pathSegments[pathSegments.length - 1]?.replace(/\.md$/u, '') ?? path;
  let score = 0;

  if (title === normalizedQuery) score += 2_000;
  else if (title.startsWith(normalizedQuery)) score += 1_200;
  else if (title.includes(normalizedQuery)) score += 800;

  if (basename === normalizedQuery) score += 1_500;
  else if (basename.startsWith(normalizedQuery)) score += 900;
  else if (path.includes(normalizedQuery)) score += 500;

  for (const term of terms.map(normalizeSearchValue)) {
    if (title === term) score += 300;
    else if (title.startsWith(term)) score += 180;
    else if (title.includes(term)) score += 120;
    if (basename.includes(term)) score += 100;
    else if (path.includes(term)) score += 60;
    if (body.includes(term)) score += 12;
  }
  return score;
}

function parseBrowseCursor(
  cursor: string | undefined,
): { relativePath: string; id: string } | null {
  if (!cursor?.startsWith('b~')) return null;
  const [, encodedPath, id] = cursor.split('~');
  if (!encodedPath || !id) return null;
  try {
    return { relativePath: Buffer.from(encodedPath, 'base64url').toString('utf8'), id };
  } catch {
    return null;
  }
}

type RankedSearchCursor = {
  score: number;
  updatedAt: number;
  id: string;
};

function parseSearchCursor(cursor: string | undefined): RankedSearchCursor | null {
  if (!cursor?.startsWith('q~')) return null;
  const [, rawScore, rawUpdatedAt, id] = cursor.split('~');
  if (!rawScore || !rawUpdatedAt || !id) return null;
  return {
    score: Number(rawScore),
    updatedAt: Number(rawUpdatedAt),
    id,
  };
}

function browseCursor(row: ProjectionSummaryRow): string {
  const encodedPath = Buffer.from(row.relativePath, 'utf8').toString('base64url');
  return `b~${encodedPath}~${row.id}`;
}

function parseRecentCursor(cursor: string | undefined): { updatedAt: number; id: string } | null {
  if (!cursor?.startsWith('r~')) return null;
  const [, rawUpdatedAt, id] = cursor.split('~');
  if (!rawUpdatedAt || !id) return null;
  const updatedAt = Number(rawUpdatedAt);
  if (!Number.isSafeInteger(updatedAt) || updatedAt < 0) return null;
  return { updatedAt, id };
}

function recentCursor(row: ProjectionSummaryRow): string {
  return `r~${row.updatedAt.getTime()}~${row.id}`;
}

function searchCursor(item: { row: ProjectionSummaryRow; score: number }): string {
  return `q~${item.score}~${item.row.updatedAt.getTime()}~${item.row.id}`;
}

function isAfterSearchCursor(
  item: { row: ProjectionSummaryRow; score: number },
  cursor: RankedSearchCursor,
): boolean {
  if (item.score !== cursor.score) return item.score < cursor.score;
  const updatedAt = item.row.updatedAt.getTime();
  if (updatedAt !== cursor.updatedAt) return updatedAt < cursor.updatedAt;
  return item.row.id < cursor.id;
}

function pathSegments(relativePath: string): string[] {
  return relativePath.split('/').filter(Boolean);
}

function hiddenDirectoryPaths(relativePath: string): string[] {
  const segments = pathSegments(relativePath);
  const hidden = new Set<string>(DEFAULT_HIDDEN_DIRECTORIES);
  const directories = segments.slice(0, -1);
  return directories
    .map((segment, index) => ({
      segment,
      relativePath: directories.slice(0, index + 1).join('/'),
    }))
    .filter(({ segment }) => segment.startsWith('.') || hidden.has(segment))
    .map(({ relativePath }) => relativePath);
}

function isHiddenPath(relativePath: string): boolean {
  return hiddenDirectoryPaths(relativePath).length > 0;
}

function fileStem(relativePath: string): string {
  const segments = pathSegments(relativePath);
  return (segments[segments.length - 1] ?? relativePath).replace(/\.md$/i, '');
}

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
      select: { id: true, knowledgeDocumentId: true, relativePath: true },
    });
    await this.upsertMany(notes);
    await this.db.knowledgeNoteProjection.updateMany({
      where: {
        bindingId: connectionId,
        deletedAt: null,
        ...(paths.length ? { relativePath: { notIn: paths } } : {}),
      },
      data: { deletedAt: new Date(), commitSha },
    });
    return deleted.map((row) => ({
      id: row.id,
      knowledgeDocumentId: row.knowledgeDocumentId as KnowledgeDocumentId | null,
      relativePath: row.relativePath,
    }));
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
        data: { deletedAt: new Date(), commitSha },
      });
    }
  }

  async listByIdentity(
    identityId: string,
    options: {
      connectionId?: string;
      query?: string;
      cursor?: string;
      includeHidden?: boolean;
      sort?: 'path' | 'recent';
      limit: number;
    },
  ): Promise<KnowledgeNoteProjectionListResponse> {
    const query = options.query?.trim();
    const terms = query ? searchTerms(query) : [];
    const hiddenPathFilters = [
      { relativePath: { startsWith: '.' } },
      { relativePath: { contains: '/.' } },
      ...DEFAULT_HIDDEN_DIRECTORIES.flatMap((directory) => [
        { relativePath: { startsWith: `${directory}/` } },
        { relativePath: { contains: `/${directory}/` } },
      ]),
    ];
    const identityWhere = {
      binding: { identityId, disconnectedAt: null },
      bindingId: options.connectionId,
      deletedAt: null,
    };
    const baseWhere =
      options.includeHidden === true
        ? identityWhere
        : {
            ...identityWhere,
            NOT: {
              OR: hiddenPathFilters,
            },
          };
    const select = {
      id: true,
      bindingId: true,
      knowledgeDocumentId: true,
      relativePath: true,
      contentHash: true,
      frontmatter: true,
      updatedAt: true,
    } as const;

    if (query && terms.length) {
      const where = {
        ...identityWhere,
        AND: terms.map((term) => ({
          OR: [
            { relativePath: { contains: term, mode: 'insensitive' as const } },
            { markdownContent: { contains: term, mode: 'insensitive' as const } },
          ],
        })),
      };
      const rows = (await this.db.knowledgeNoteProjection.findMany({
        where,
        select: { ...select, markdownContent: true },
      })) as SearchProjectionRow[];
      const visibleRows =
        options.includeHidden === true
          ? rows
          : rows.filter((row) => !isHiddenPath(row.relativePath));
      const cursor = parseSearchCursor(options.cursor);
      const ranked = visibleRows
        .map((row) => ({ row, score: scoreSearchRow(row, query, terms) }))
        .sort(
          (left, right) =>
            right.score - left.score ||
            right.row.updatedAt.getTime() - left.row.updatedAt.getTime() ||
            right.row.id.localeCompare(left.row.id),
        );
      const candidates = cursor
        ? ranked.filter((item) => isAfterSearchCursor(item, cursor))
        : ranked;
      const page = candidates.slice(0, options.limit);
      return {
        notes: page.map(({ row }) => this.toSummary(row)),
        total: ranked.length,
        nextCursor:
          candidates.length > options.limit && page.length
            ? searchCursor(page[page.length - 1]!)
            : null,
      };
    }

    if (options.sort === 'recent') {
      const cursor = parseRecentCursor(options.cursor);
      const where = cursor
        ? {
            ...baseWhere,
            OR: [
              { updatedAt: { lt: new Date(cursor.updatedAt) } },
              { updatedAt: new Date(cursor.updatedAt), id: { lt: cursor.id } },
            ],
          }
        : baseWhere;
      const [total, rows] = await Promise.all([
        this.db.knowledgeNoteProjection.count({ where: baseWhere }),
        this.db.knowledgeNoteProjection.findMany({
          where,
          select,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: options.limit + 1,
        }),
      ]);
      const typedRows = rows as ProjectionSummaryRow[];
      const page = typedRows.slice(0, options.limit);
      return {
        notes: page.map((row) => this.toSummary(row)),
        total,
        nextCursor:
          typedRows.length > options.limit && page.length
            ? recentCursor(page[page.length - 1]!)
            : null,
      };
    }

    const cursor = parseBrowseCursor(options.cursor);
    const where = cursor
      ? {
          ...baseWhere,
          OR: [
            { relativePath: { gt: cursor.relativePath } },
            { relativePath: cursor.relativePath, id: { gt: cursor.id } },
          ],
        }
      : baseWhere;
    const [total, rows] = await Promise.all([
      this.db.knowledgeNoteProjection.count({ where: baseWhere }),
      this.db.knowledgeNoteProjection.findMany({
        where,
        select,
        orderBy: [{ relativePath: 'asc' }, { id: 'asc' }],
        take: options.limit + 1,
      }),
    ]);
    const typedRows = rows as ProjectionSummaryRow[];
    const page = typedRows.slice(0, options.limit);
    return {
      notes: page.map((row) => this.toSummary(row)),
      total,
      nextCursor:
        typedRows.length > options.limit && page.length
          ? browseCursor(page[page.length - 1]!)
          : null,
    };
  }

  async listReferenceableByIdentity(
    identityId: string,
    options: ListReferenceableKnowledgeDocumentsReq,
  ): Promise<ReferenceableKnowledgeDocumentListResponse> {
    const query = options.query?.trim();
    const terms = query ? searchTerms(query) : [];
    const hiddenPathFilters = [
      { relativePath: { startsWith: '.' } },
      { relativePath: { contains: '/.' } },
      ...DEFAULT_HIDDEN_DIRECTORIES.flatMap((directory) => [
        { relativePath: { startsWith: `${directory}/` } },
        { relativePath: { contains: `/${directory}/` } },
      ]),
    ];
    const identityWhere = {
      binding: { identityId, disconnectedAt: null },
      deletedAt: null,
      knowledgeDocumentId: { not: null },
    };
    const baseWhere = {
      ...identityWhere,
      NOT: { OR: hiddenPathFilters },
    };
    const select = {
      id: true,
      bindingId: true,
      knowledgeDocumentId: true,
      relativePath: true,
      contentHash: true,
      frontmatter: true,
      updatedAt: true,
      binding: { select: { knowledgeSpaceId: true } },
    } as const;

    if (query && terms.length) {
      const rows = (await this.db.knowledgeNoteProjection.findMany({
        where: {
          ...identityWhere,
          AND: terms.map((term) => ({
            OR: [
              { relativePath: { contains: term, mode: 'insensitive' as const } },
              { markdownContent: { contains: term, mode: 'insensitive' as const } },
            ],
          })),
        },
        select: { ...select, markdownContent: true },
      })) as ReferenceableSearchProjectionRow[];
      const cursor = parseSearchCursor(options.cursor);
      const ranked = rows
        .filter((row) => !isHiddenPath(row.relativePath))
        .map((row) => ({ row, score: scoreSearchRow(row, query, terms) }))
        .sort(
          (left, right) =>
            right.score - left.score ||
            right.row.updatedAt.getTime() - left.row.updatedAt.getTime() ||
            right.row.id.localeCompare(left.row.id),
        );
      const candidates = cursor
        ? ranked.filter((item) => isAfterSearchCursor(item, cursor))
        : ranked;
      const page = candidates.slice(0, options.limit);
      return {
        documents: page.map(({ row }) => this.toReferenceableSummary(row)),
        total: ranked.length,
        nextCursor:
          candidates.length > options.limit && page.length
            ? searchCursor(page[page.length - 1]!)
            : null,
      };
    }

    const cursor = parseRecentCursor(options.cursor);
    const where = cursor
      ? {
          ...baseWhere,
          OR: [
            { updatedAt: { lt: new Date(cursor.updatedAt) } },
            { updatedAt: new Date(cursor.updatedAt), id: { lt: cursor.id } },
          ],
        }
      : baseWhere;
    const [total, rows] = await Promise.all([
      this.db.knowledgeNoteProjection.count({ where: baseWhere }),
      this.db.knowledgeNoteProjection.findMany({
        where,
        select,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: options.limit + 1,
      }),
    ]);
    const typedRows = rows as ReferenceableProjectionRow[];
    const page = typedRows.slice(0, options.limit);
    return {
      documents: page.map((row) => this.toReferenceableSummary(row)),
      total,
      nextCursor:
        typedRows.length > options.limit && page.length
          ? recentCursor(page[page.length - 1]!)
          : null,
    };
  }

  async listTreeByIdentity(
    identityId: string,
    options: { connectionId?: string; parent: string; includeHidden: boolean },
  ): Promise<KnowledgeNoteTreeResponse> {
    const parent = options.parent.trim().replace(/^\/+|\/+$/g, '');
    const prefix = parent ? `${parent}/` : '';
    const rows = (await this.db.knowledgeNoteProjection.findMany({
      where: {
        binding: { identityId, disconnectedAt: null },
        bindingId: options.connectionId,
        deletedAt: null,
        ...(prefix ? { relativePath: { startsWith: prefix } } : {}),
      },
      select: {
        id: true,
        bindingId: true,
        knowledgeDocumentId: true,
        relativePath: true,
        contentHash: true,
        frontmatter: true,
        updatedAt: true,
      },
      orderBy: { relativePath: 'asc' },
    })) as ProjectionSummaryRow[];

    const total = rows.length;
    const hiddenRows = rows.filter((row) => isHiddenPath(row.relativePath));
    const hiddenDirectories = [
      ...new Set(hiddenRows.flatMap((row) => hiddenDirectoryPaths(row.relativePath))),
    ].sort((left, right) => treeCollator.compare(left, right));
    const visibleRows = options.includeHidden
      ? rows
      : rows.filter((row) => !isHiddenPath(row.relativePath));
    const directories = new Map<
      string,
      { name: string; relativePath: string; noteCount: number }
    >();
    const notes: KnowledgeNoteTreeNodeDTO[] = [];
    const parentDepth = parent ? pathSegments(parent).length : 0;

    for (const row of visibleRows) {
      const segments = pathSegments(row.relativePath);
      if (segments.length <= parentDepth) continue;
      const nextSegment = segments[parentDepth];
      if (!nextSegment) continue;

      if (segments.length > parentDepth + 1) {
        const relativePath = [...segments.slice(0, parentDepth), nextSegment].join('/');
        const current = directories.get(relativePath);
        if (current) current.noteCount += 1;
        else directories.set(relativePath, { name: nextSegment, relativePath, noteCount: 1 });
        continue;
      }

      notes.push({
        kind: 'note',
        name: fileStem(row.relativePath),
        title: frontmatterTitle(row.frontmatter) || fileStem(row.relativePath),
        relativePath: row.relativePath,
        projectionId: row.id,
        knowledgeDocumentId:
          row.knowledgeDocumentId as KnowledgeNoteProjectionSummaryDTO['knowledgeDocumentId'],
        contentHash: row.contentHash,
        updatedAt: row.updatedAt.getTime(),
      });
    }

    const directoryNodes: KnowledgeNoteTreeNodeDTO[] = [...directories.values()].map(
      (directory) => ({
        kind: 'directory',
        name: directory.name,
        relativePath: directory.relativePath,
        noteCount: directory.noteCount,
        hasChildren: true,
      }),
    );

    const nodes = [...directoryNodes, ...notes].sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
      const nameComparison = treeCollator.compare(left.name, right.name);
      return nameComparison || treeCollator.compare(left.relativePath, right.relativePath);
    });

    const metadata =
      parent === ''
        ? {
            total,
            visibleTotal: visibleRows.length,
            hiddenNoteCount: hiddenRows.length,
            hiddenDirectories,
          }
        : null;

    return { parent, nodes, metadata };
  }

  async resolveReferenceForIdentity(
    identityId: string,
    options: { connectionId?: string; reference: string },
  ): Promise<KnowledgeNoteProjectionClientDTO | null> {
    const reference = options.reference.trim().replace(/\\/g, '/');
    return this.toClientOrNull(
      await this.db.knowledgeNoteProjection.findFirst({
        where: {
          binding: { identityId, disconnectedAt: null },
          bindingId: options.connectionId,
          deletedAt: null,
          OR: [{ id: reference }, { knowledgeDocumentId: reference }, { relativePath: reference }],
        },
      }),
    );
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

  async findLiveByDocumentId(
    connectionId: string,
    knowledgeDocumentId: KnowledgeDocumentId,
  ): Promise<KnowledgeNoteProjectionClientDTO[]> {
    const rows = await this.db.knowledgeNoteProjection.findMany({
      where: { bindingId: connectionId, knowledgeDocumentId, deletedAt: null },
      orderBy: { relativePath: 'asc' },
    });
    return rows.map((row) => this.toClient(row));
  }

  async listLiveByConnection(connectionId: string): Promise<KnowledgeNoteProjectionClientDTO[]> {
    const rows = await this.db.knowledgeNoteProjection.findMany({
      where: { bindingId: connectionId, deletedAt: null },
      orderBy: { relativePath: 'asc' },
    });
    return rows.map((row) => this.toClient(row));
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
          knowledgeDocumentId: note.knowledgeDocumentId,
          relativePath: note.relativePath,
          commitSha: note.commitSha,
          blobSha: note.blobSha,
          contentHash: note.contentHash,
          markdownContent: note.markdownContent,
          frontmatter: note.frontmatter as never,
        },
        update: {
          knowledgeDocumentId: note.knowledgeDocumentId,
          commitSha: note.commitSha,
          blobSha: note.blobSha,
          contentHash: note.contentHash,
          frontmatter: note.frontmatter as never,
          markdownContent: note.markdownContent,
          deletedAt: null,
        },
      });
    }
  }

  private toReferenceableSummary(
    row: ReferenceableProjectionRow,
  ): ReferenceableKnowledgeDocumentSummaryDTO {
    const title =
      frontmatterTitle(row.frontmatter) ||
      row.relativePath.split('/').slice(-1)[0]?.replace(/\.md$/i, '') ||
      row.relativePath;
    return {
      documentId: row.knowledgeDocumentId as ReferenceableKnowledgeDocumentSummaryDTO['documentId'],
      knowledgeSpaceId: row.binding
        .knowledgeSpaceId as ReferenceableKnowledgeDocumentSummaryDTO['knowledgeSpaceId'],
      projectionId: row.id,
      connectionId: row.bindingId,
      title,
      relativePath: row.relativePath,
      updatedAt: row.updatedAt.getTime(),
    };
  }

  private toClientOrNull(row: ProjectionRow): KnowledgeNoteProjectionClientDTO | null {
    return row ? this.toClient(row) : null;
  }

  private toSummary(row: ProjectionSummaryRow): KnowledgeNoteProjectionSummaryDTO {
    const title =
      frontmatterTitle(row.frontmatter) ||
      row.relativePath.split('/').slice(-1)[0]?.replace(/\.md$/i, '') ||
      row.relativePath;
    return {
      id: row.id,
      connectionId: row.bindingId,
      knowledgeDocumentId:
        row.knowledgeDocumentId as KnowledgeNoteProjectionSummaryDTO['knowledgeDocumentId'],
      relativePath: row.relativePath,
      title,
      contentHash: row.contentHash,
      updatedAt: row.updatedAt.getTime(),
    };
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
      knowledgeDocumentId:
        row.knowledgeDocumentId as KnowledgeNoteProjectionClientDTO['knowledgeDocumentId'],
      relativePath: row.relativePath,
      title,
      commitSha: row.commitSha,
      blobSha: row.blobSha,
      contentHash: row.contentHash,
      frontmatter,
      markdownContent: row.markdownContent,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
      deletedAt: row.deletedAt?.getTime() ?? null,
    };
  }
}
