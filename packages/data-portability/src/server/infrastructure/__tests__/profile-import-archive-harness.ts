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

interface MastraThreadRow {
  id: string;
  resourceId: string;
  title: string;
  metadata: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MastraMessageRow {
  id: string;
  thread_id: string;
  resourceId: string;
  content: string;
  role: string;
  type: string;
  createdAt: Date;
}

interface FakeConversationRow {
  id: string;
  identityId: string;
  name: string;
  status: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

type RowSnapshot = [string, Row][];

function cloneRow(row: Row): Row {
  const copy: Row = {};
  for (const [key, value] of Object.entries(row)) {
    copy[key] = value instanceof Date ? new Date(value) : value;
  }
  return copy;
}

function snapshotRows(rows: Map<string, Row>): RowSnapshot {
  return [...rows.entries()].map(([key, row]) => [key, cloneRow(row)]);
}

function restoreRows(rows: Map<string, Row>, snapshot: RowSnapshot): void {
  rows.clear();
  for (const [key, row] of snapshot) rows.set(key, cloneRow(row));
}

/**
 * Minimal in-memory Prisma double for archive staging and Profile import
 * service tests. It implements the delegates those paths call, plus the raw
 * Mastra transcript SQL used by the AI-owned import port, and rolls back those
 * writes when a transaction callback fails.
 */
export function createFakeProfileImportDb() {
  const archives = new Map<string, Row>();
  const chunks = new Map<string, Row>();
  const operations = new Map<string, Row>();
  const threads = new Map<string, MastraThreadRow>();
  const messages = new Map<string, MastraMessageRow>();
  const conversations = new Map<string, FakeConversationRow>();
  let accountStatus = 'Active';
  /** When set, a message batch writes this many rows before failing. */
  let failBatchAfter: number | null = null;

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

  const conversation = {
    async findUnique({ where, select }: { where: Row; select?: Row }) {
      const row = conversations.get(String(where.id));
      if (!row) return null;
      return select && Object.keys(select).length
        ? Object.fromEntries(
            Object.keys(select).map((field) => [field, (row as unknown as Row)[field]]),
          )
        : { ...row };
    },
    async findFirst({ where }: { where: Row }) {
      const row = [...conversations.values()].find((candidate) =>
        matches(candidate as unknown as Row, where),
      );
      return row ? { ...row } : null;
    },
    async findMany({ where = {}, orderBy }: { where?: Row; orderBy?: { updatedAt?: 'asc' | 'desc' } }) {
      let rows = [...conversations.values()].filter((row) =>
        matches(row as unknown as Row, where),
      );
      if (orderBy?.updatedAt) {
        const direction = orderBy.updatedAt === 'asc' ? 1 : -1;
        rows = rows.sort(
          (left, right) =>
            (left.updatedAt.getTime() - right.updatedAt.getTime()) * direction,
        );
      }
      return rows.map((row) => ({ ...row }));
    },
    async upsert({ where, create, update }: { where: Row; create: Row; update: Row }) {
      const existing = conversations.get(String(where.id));
      if (existing) {
        Object.assign(existing, update);
        return { ...existing };
      }
      const row = { ...(create as unknown as FakeConversationRow) };
      conversations.set(row.id, row);
      return { ...row };
    },
    async updateMany({ where, data }: { where: Row; data: Row }) {
      let count = 0;
      for (const row of conversations.values()) {
        if (!matches(row as unknown as Row, where)) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    },
  };

  const whereThread = (sql: string) => sql.includes('FROM mastra.mastra_threads');
  const whereMessages = (sql: string) => sql.includes('FROM mastra.mastra_messages');

  /**
   * Positional SQL emulation for `createAiMessageStore`. Only the statements
   * that module emits are recognised; anything else returns no rows, matching
   * an empty fake database.
   */
  async function queryRaw(sql: string, params: readonly unknown[]): Promise<unknown[]> {
    if (whereThread(sql) && sql.includes('JOIN public.ai_conversations')) {
      const identityId = String(params[0]);
      return [...threads.values()]
        .filter((thread) => {
          const shell = conversations.get(thread.id);
          return (
            thread.resourceId === identityId &&
            shell?.identityId === identityId &&
            shell?.deletedAt === null
          );
        })
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
        .map((thread) => ({
          id: thread.id,
          title: thread.title,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
        }));
    }
    if (whereThread(sql) && sql.includes('WHERE "resourceId"=$1')) {
      return [...threads.values()]
        .filter((thread) => thread.resourceId === String(params[0]))
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
        .map((thread) => ({ id: thread.id }));
    }
    if (whereThread(sql) && sql.includes('WHERE id=$1')) {
      const thread = threads.get(String(params[0]));
      return thread ? [{ id: thread.id, resourceId: thread.resourceId }] : [];
    }
    if (whereMessages(sql) && sql.includes('jsonb_array_elements_text')) {
      const ids = JSON.parse(String(params[0])) as string[];
      return ids.flatMap((id) => {
        const message = messages.get(id);
        return message
          ? [
              {
                id: message.id,
                thread_id: message.thread_id,
                resourceId: message.resourceId,
                createdAt: message.createdAt,
              },
            ]
          : [];
      });
    }
    if (whereMessages(sql) && sql.includes('SELECT MAX(')) {
      const threadId = String(params[0]);
      const latest = [...messages.values()]
        .filter((message) => message.thread_id === threadId)
        .reduce<number | null>(
          (max, message) =>
            max === null || message.createdAt.getTime() > max
              ? message.createdAt.getTime()
              : max,
          null,
        );
      return [{ latest: latest === null ? null : new Date(latest) }];
    }
    if (whereMessages(sql) && sql.includes('WHERE thread_id=$1')) {
      return [...messages.values()]
        .filter((message) => message.thread_id === String(params[0]))
        .sort(
          (left, right) =>
            left.createdAt.getTime() - right.createdAt.getTime() ||
            (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
        )
        .map(({ id, role, type, content, createdAt }) => ({
          id,
          role,
          type,
          content,
          createdAt,
        }));
    }
    if (sql.includes('FROM public.ai_conversations') && sql.includes('SELECT name')) {
      const row = conversations.get(String(params[0]));
      const identityId = String(params[1]);
      return row && row.identityId === identityId && row.deletedAt === null
        ? [{ name: row.name }]
        : [];
    }
    if (sql.includes('jsonb_to_recordset')) {
      const rows = JSON.parse(String(params[0])) as Array<{
        id: string;
        thread_id: string;
        resourceId: string;
        content: string;
        role: string;
        type: string;
        createdAt: string;
      }>;
      const written: Array<{ written: number }> = [];
      for (const [index, row] of rows.entries()) {
        if (failBatchAfter !== null && index >= failBatchAfter) {
          throw new Error('Injected message write failure');
        }
        const existing = messages.get(row.id);
        if (existing && (existing.thread_id !== row.thread_id || existing.resourceId !== row.resourceId)) {
          continue;
        }
        messages.set(row.id, {
          id: row.id,
          thread_id: row.thread_id,
          resourceId: row.resourceId,
          content: row.content,
          role: row.role,
          type: row.type,
          createdAt: new Date(row.createdAt),
        });
        written.push({ written: 1 });
      }
      return written;
    }
    return [];
  }

  async function executeRaw(sql: string, params: readonly unknown[]): Promise<number> {
    if (sql.startsWith('INSERT INTO mastra.mastra_threads')) {
      threads.set(String(params[0]), {
        id: String(params[0]),
        resourceId: String(params[1]),
        title: String(params[2]),
        metadata: String(params[3]),
        createdAt: new Date(String(params[4])),
        updatedAt: new Date(String(params[5])),
      });
      return 1;
    }
    if (sql.startsWith('UPDATE mastra.mastra_threads SET "updatedAt"')) {
      const thread = threads.get(String(params[2]));
      if (thread) thread.updatedAt = new Date(String(params[0]));
      return thread ? 1 : 0;
    }
    return 0;
  }

  const db = {
    profileImportArchive: archive,
    profileImportArchiveChunk: archiveChunk,
    profileImportOperation: operation,
    aiConversation: conversation,
    account: {
      async findUnique() {
        return { status: accountStatus };
      },
    },
    async $transaction<T>(run: (tx: unknown) => Promise<T>): Promise<T> {
      const snapshot = {
        archives: snapshotRows(archives),
        chunks: snapshotRows(chunks),
        operations: snapshotRows(operations),
        threads: snapshotRows(threads as unknown as Map<string, Row>),
        messages: snapshotRows(messages as unknown as Map<string, Row>),
        conversations: snapshotRows(conversations as unknown as Map<string, Row>),
      };
      try {
        return await run(db);
      } catch (error) {
        restoreRows(archives, snapshot.archives);
        restoreRows(chunks, snapshot.chunks);
        restoreRows(operations, snapshot.operations);
        restoreRows(threads as unknown as Map<string, Row>, snapshot.threads);
        restoreRows(messages as unknown as Map<string, Row>, snapshot.messages);
        restoreRows(conversations as unknown as Map<string, Row>, snapshot.conversations);
        throw error;
      }
    },
    async $executeRaw() {
      return 0;
    },
    async $queryRaw() {
      return [{ schema: 'public', name: 'accounts' }];
    },
    async $executeRawUnsafe(sql: string, ...params: unknown[]) {
      return executeRaw(sql, params);
    },
    async $queryRawUnsafe(sql: string, ...params: unknown[]) {
      return queryRaw(sql, params);
    },
  };

  return {
    db: db as unknown as PrismaClient,
    archives,
    chunks,
    operations,
    threads,
    messages,
    conversations,
    setAccountStatus(status: string) {
      accountStatus = status;
    },
    /** Make the next message batch write `count` rows and then fail. */
    failNextMessageBatch(count = 0) {
      failBatchAfter = count;
    },
    clearMessageBatchFailure() {
      failBatchAfter = null;
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

/**
 * Two conversations with 22 messages total. The transcript deliberately keeps
 * a tool-invocation content and an embedded `memoflow-runtime` receipt verbatim
 * so apply/readback prove the archive text is never normalised.
 */
export interface MultiThreadArchiveFixture {
  readonly threads: ArchiveThreadLineV1[];
  readonly messages: ArchiveMessageLineV1[];
  readonly manifest: ArchiveManifest;
  readonly text: string;
}

export const TOOL_CALL_CONTENT = JSON.stringify({
  format: 2,
  parts: [
    {
      type: 'tool-invocation',
      toolInvocation: {
        toolCallId: 'call-865',
        toolName: 'routine_create',
        state: 'result',
        args: { name: 'Morning run' },
        result: { id: 'routine-865' },
      },
    },
  ],
});

export const RUNTIME_RECEIPT_CONTENT = JSON.stringify({
  format: 2,
  parts: [{ type: 'data-memoflow-runtime', data: {} }],
  metadata: {
    memoFlowRuntime: {
      approvalReceipt: {
        runId: 'run-865',
        toolCallId: 'call-865',
        toolName: 'routine_create',
        decision: 'approve',
        category: 'edit',
        risk: 'high',
      },
      runOutcome: { runId: 'run-865', status: 'success' },
      toolActivities: [{ toolCallId: 'call-865', toolName: 'routine_create', state: 'result' }],
    },
  },
});

export function buildMultiThreadArchiveFixture(): MultiThreadArchiveFixture {
  const threads: ArchiveThreadLineV1[] = [
    {
      k: 'thread',
      v: 1,
      ref: 'ai-conversations:1',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_500,
    },
    {
      k: 'thread',
      v: 1,
      ref: 'ai-conversations:2',
      createdAt: 1_700_000_100_000,
      updatedAt: 1_700_000_100_500,
    },
  ];

  const threadOne = Array.from({ length: 14 }, (_, ordinal): ArchiveMessageLineV1 => {
    const content =
      ordinal === 3
        ? TOOL_CALL_CONTENT
        : ordinal === 8
          ? RUNTIME_RECEIPT_CONTENT
          : `conversation one message ${ordinal}`;
    return {
      k: 'message',
      v: 1,
      ref: 'ai-conversations:1',
      ordinal,
      sid: `source-one-${ordinal}`,
      role: ordinal % 2 === 0 ? 'user' : 'assistant',
      type: ordinal === 3 ? 'tool' : 'text',
      content,
      createdAt: 1_700_000_000_000 + ordinal,
    };
  });
  const threadTwo = Array.from({ length: 8 }, (_, ordinal): ArchiveMessageLineV1 => ({
    k: 'message',
    v: 1,
    ref: 'ai-conversations:2',
    ordinal,
    sid: `source-two-${ordinal}`,
    role: ordinal % 2 === 0 ? 'assistant' : 'user',
    type: 'text',
    content: ordinal === 7 ? RUNTIME_RECEIPT_CONTENT : `conversation two message ${ordinal}`,
    createdAt: 1_700_000_100_000 + ordinal,
  }));

  const messages = [...threadOne, ...threadTwo];
  return {
    threads,
    messages,
    manifest: computeArchiveManifest([
      computeThreadManifestEntry('ai-conversations:1', threadOne),
      computeThreadManifestEntry('ai-conversations:2', threadTwo),
    ]),
    text: [...threads, ...messages].map((line) => JSON.stringify(line)).join('\n') + '\n',
  };
}

export interface StageableArchive {
  readonly manifest: ArchiveManifest;
  readonly text: string;
}

export async function stageArchive(
  store: ProfileImportArchiveStore,
  identityId: string,
  requestId: string,
  fixture: StageableArchive,
  chunkSize = 96 * 1024,
): Promise<{ readonly chunkCount: number }> {
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
  return { chunkCount: chunks.length };
}

export { sha256Hex };
