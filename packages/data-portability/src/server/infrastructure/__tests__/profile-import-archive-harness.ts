import { createHash } from 'node:crypto';
import type { PrismaClient } from '@memoflow/database';
import type { ArchiveManifest } from '@memoflow/data-portability-contracts';
import {
  computeArchiveManifest,
  computeThreadManifestEntry,
  type ArchiveMessageLineV1,
  type ArchiveThreadLineV1,
} from '@memoflow/ai-contracts/portable-messages-archive';
import type { ProfileImportArchiveStore } from '../prisma-profile-import-archive';

type Row = Record<string, unknown>;

const sha256Hex = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

function valueMatches(value: unknown, expected: unknown): boolean {
  if (expected !== null && typeof expected === 'object') {
    if ('in' in (expected as object)) {
      return ((expected as { in: unknown[] }).in ?? []).includes(value);
    }
    if ('lt' in (expected as object)) {
      return value instanceof Date && value < (expected as { lt: Date }).lt;
    }
  }
  return (value ?? null) === (expected ?? null);
}

function matches(row: Row, where: Row): boolean {
  if (where.identityId_requestId) {
    const key = where.identityId_requestId as { identityId: string; requestId: string };
    if (row.identityId !== key.identityId || row.requestId !== key.requestId) return false;
  }
  return Object.entries(where).every(([field, expected]) =>
    field === 'identityId_requestId' ? true : valueMatches(row[field], expected),
  );
}

/**
 * Minimal in-memory Prisma double for archive staging and Profile import
 * service tests. It implements only the delegates those paths call.
 */
export function createFakeProfileImportDb() {
  const archives = new Map<string, Row>();
  const chunks = new Map<string, Row>();
  const operations = new Map<string, Row>();
  let accountStatus = 'Active';

  const chunkKey = (archiveId: string, index: number) => `${archiveId}:${index}`;

  const archive = {
    async findUnique({ where }: { where: Row }) {
      if (where.id !== undefined) return archives.get(String(where.id)) ?? null;
      const key = where.identityId_requestId as { identityId: string; requestId: string };
      return (
        [...archives.values()].find(
          (row) =>
            row.identityId === key.identityId && row.requestId === key.requestId,
        ) ?? null
      );
    },
    async create({ data }: { data: Row }) {
      if (archives.has(String(data.id))) throw { code: 'P2002' };
      if (
        [...archives.values()].some(
          (row) => row.identityId === data.identityId && row.requestId === data.requestId,
        )
      ) {
        throw { code: 'P2002' };
      }
      archives.set(String(data.id), {
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      });
      return { ...data };
    },
    async updateMany({ where, data }: { where: Row; data: Row }) {
      let count = 0;
      for (const row of archives.values()) {
        if (!matches(row, where)) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    },
    async findMany({
      where = {},
      select,
      take,
    }: {
      where?: Row;
      select?: Row;
      take?: number;
    }) {
      let rows = [...archives.values()].filter((row) => matches(row, where));
      if (take !== undefined) rows = rows.slice(0, take);
      return rows.map((row) =>
        select && Object.keys(select).length
          ? Object.fromEntries(Object.keys(select).map((field) => [field, row[field]]))
          : row,
      );
    },
    async deleteMany({ where }: { where: Row }) {
      let count = 0;
      for (const [id, row] of archives) {
        if (!matches(row, where)) continue;
        archives.delete(id);
        for (const [key, chunk] of chunks) {
          if (chunk.archiveId === id) chunks.delete(key);
        }
        count += 1;
      }
      return { count };
    },
  };

  const archiveChunk = {
    async findMany({
      where = {},
      orderBy,
      select,
    }: {
      where?: Row;
      orderBy?: { index?: 'asc' | 'desc' };
      select?: Row;
    }) {
      let rows = [...chunks.values()].filter((row) => matches(row, where));
      if (orderBy?.index) {
        const direction = orderBy.index === 'asc' ? 1 : -1;
        rows = rows.sort((left, right) => (Number(left.index) - Number(right.index)) * direction);
      }
      return rows.map((row) =>
        select && Object.keys(select).length
          ? Object.fromEntries(Object.keys(select).map((field) => [field, row[field]]))
          : row,
      );
    },
    async findUnique({ where }: { where: Row }) {
      const key = where.archiveId_index as { archiveId: string; index: number };
      return chunks.get(chunkKey(key.archiveId, key.index)) ?? null;
    },
    async create({ data }: { data: Row }) {
      const key = chunkKey(String(data.archiveId), Number(data.index));
      if (chunks.has(key)) throw { code: 'P2002' };
      chunks.set(key, { ...data });
      return { ...data };
    },
    async update({ where, data }: { where: Row; data: Row }) {
      const key = where.archiveId_index as { archiveId: string; index: number };
      const row = chunks.get(chunkKey(key.archiveId, key.index));
      if (!row) throw new Error('Archive chunk not found');
      Object.assign(row, data);
      return { ...row };
    },
    async deleteMany({ where }: { where: Row }) {
      let count = 0;
      for (const [key, row] of chunks) {
        if (!matches(row, where)) continue;
        chunks.delete(key);
        count += 1;
      }
      return { count };
    },
  };

  const operation = {
    async findUnique({ where }: { where: Row }) {
      const key = where.identityId_requestId as { identityId: string; requestId: string };
      return (
        [...operations.values()].find(
          (row) => row.identityId === key.identityId && row.requestId === key.requestId,
        ) ?? null
      );
    },
    async upsert({ where, create, update }: { where: Row; create: Row; update: Row }) {
      const key = where.identityId_requestId as { identityId: string; requestId: string };
      const existing = [...operations.values()].find(
        (row) => row.identityId === key.identityId && row.requestId === key.requestId,
      );
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return { ...existing };
      }
      const row: Row = { ...create, createdAt: new Date(), updatedAt: new Date() };
      operations.set(String(row.id), row);
      return { ...row };
    },
    async update({ where, data }: { where: { id: string }; data: Row }) {
      const row = operations.get(where.id);
      if (!row) throw new Error('Profile import operation not found');
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
  };

  const db = {
    profileImportArchive: archive,
    profileImportArchiveChunk: archiveChunk,
    profileImportOperation: operation,
    account: {
      async findUnique() {
        return { status: accountStatus };
      },
    },
    async $transaction<T>(run: (tx: unknown) => Promise<T>): Promise<T> {
      return run(db);
    },
    async $executeRaw() {
      return 0;
    },
    async $queryRaw() {
      return [{ schema: 'public', name: 'accounts' }];
    },
    async $executeRawUnsafe() {
      return 0;
    },
    async $queryRawUnsafe() {
      return [];
    },
  };

  return {
    db: db as unknown as PrismaClient,
    archives,
    chunks,
    operations,
    setAccountStatus(status: string) {
      accountStatus = status;
    },
  };
}

export interface ArchiveFixture {
  readonly thread: ArchiveThreadLineV1;
  readonly messages: ArchiveMessageLineV1[];
  readonly manifest: ArchiveManifest;
  readonly text: string;
}

export function buildArchiveFixture(
  ref = 'ai-conversations:1',
  count = 2,
): ArchiveFixture {
  const thread: ArchiveThreadLineV1 = {
    k: 'thread',
    v: 1,
    ref,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_001_000,
  };
  const messages: ArchiveMessageLineV1[] = Array.from({ length: count }, (_, ordinal) => ({
    k: 'message' as const,
    v: 1 as const,
    ref,
    ordinal,
    sid: `${ref}-source-${ordinal}`,
    role: ordinal % 2 === 0 ? 'user' : 'assistant',
    type: 'text',
    content: `message ${ordinal}`,
    createdAt: 1_700_000_000_100 + ordinal,
  }));
  return {
    thread,
    messages,
    manifest: computeArchiveManifest([computeThreadManifestEntry(ref, messages)]),
    text: [thread, ...messages].map((line) => JSON.stringify(line)).join('\n') + '\n',
  };
}

export async function stageArchive(
  store: ProfileImportArchiveStore,
  identityId: string,
  requestId: string,
  fixture: ArchiveFixture,
  chunkSize = 96 * 1024,
): Promise<void> {
  const bytes = Buffer.from(fixture.text, 'utf8');
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(bytes.subarray(offset, offset + chunkSize));
  }
  await store.prepare(identityId, requestId, {
    archiveDigest: fixture.manifest.archive.digest,
    codec: 'ndjson',
    chunkCount: chunks.length,
    uncompressedBytes: bytes.byteLength,
  });
  for (const [index, chunk] of chunks.entries()) {
    await store.putChunk(identityId, requestId, {
      index,
      digest: sha256Hex(chunk),
      data: chunk.toString('base64'),
    });
  }
  await store.complete(identityId, requestId);
}

export { sha256Hex };
