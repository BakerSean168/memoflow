import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import {
  PROFILE_IMPORT_ARCHIVE_MAX_CHUNK_BYTES,
  type ArchiveManifest,
  type ArchiveThreadManifestEntry,
  type PortableCapability,
  type PortableCapabilityExecutionContext,
  type PortableCapabilityReceipt,
  type ProfileImportArchiveCodec,
} from '@memoflow/data-portability-contracts';
import {
  AI_CONVERSATION_MESSAGES_CAPABILITY,
  AIConversationMessagesPortablePayloadV1Schema,
} from '@memoflow/ai-contracts';
import {
  computeArchiveManifest,
  computeThreadManifestEntry,
  type ArchiveLineV1,
  type ArchiveMessageLineV1,
} from '@memoflow/ai-contracts/portable-messages-archive';
import { readProfileSqliteSnapshot } from './profile-sqlite-snapshot';

/**
 * Desktop-side read port for the `ai-conversation-messages@1` archive.
 *
 * It only reads the local Mastra SQLite snapshot through native `SELECT`s and
 * projects the columns defined by #865 design §2.4. It never starts a Mastra
 * Memory instance, so no migration or write can happen on the source profile.
 */

export interface DesktopMessageThreadRef {
  readonly threadId: string;
  readonly ref: string;
}

export interface DesktopMessageArchive {
  readonly manifest: ArchiveManifest;
  readonly lines: readonly ArchiveLineV1[];
  readonly refsByThreadId: readonly DesktopMessageThreadRef[];
}

export interface DesktopMessageExportPort {
  readArchive(
    identityId: string,
    resolveExportReference: (threadId: string) => string,
  ): Promise<DesktopMessageArchive>;
  /** Last archive produced by this port; the import service uploads these bytes. */
  readonly lastArchive: DesktopMessageArchive | null;
}

const ThreadRowSchema = z
  .object({
    id: z.string().min(1),
    resourceId: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    metadata: z.unknown().optional(),
    createdAt: z.unknown(),
    updatedAt: z.unknown(),
  })
  .passthrough();

const MessageRowSchema = z
  .object({
    id: z.string().min(1),
    thread_id: z.string().min(1),
    content: z.string(),
    role: z.string().min(1),
    type: z.string().min(1),
    createdAt: z.unknown(),
    resourceId: z.string().nullable().optional(),
  })
  .passthrough();

type ThreadRow = z.infer<typeof ThreadRowSchema>;
type MessageRow = z.infer<typeof MessageRowSchema>;

/** Mastra libsql stores timestamps as ISO strings; accept epoch numbers for older files. */
export function mastraTimestampToMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (value.trim().length > 0 && Number.isFinite(numeric)) return Math.trunc(numeric);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error('UNSUPPORTED_MASTRA_TIMESTAMP');
}

function compareMessageOrder(
  left: { createdAt: number; id: string },
  right: { createdAt: number; id: string },
): number {
  return left.createdAt - right.createdAt || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

async function tableNames(db: IElectronDatabase) {
  const tables = z
    .array(z.object({ name: z.string() }))
    .parse(
      await db.getAll(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      ),
    );
  return new Set(tables.map((table) => table.name));
}

const emptyArchive = (): DesktopMessageArchive => ({
  manifest: computeArchiveManifest([]),
  lines: [],
  refsByThreadId: [],
});

/**
 * Read one archive from `mastra.db`. Threads without a live conversation shell
 * are skipped here; the source inventory reports them as orphan blockers.
 */
export async function readDesktopMessageArchive(
  mastraPath: string | null,
  resolveExportReference: (threadId: string) => string,
): Promise<DesktopMessageArchive> {
  if (!mastraPath) return emptyArchive();
  try {
    if (!(await fs.stat(mastraPath)).isFile()) return emptyArchive();
  } catch {
    return emptyArchive();
  }
  try {
    return await readProfileSqliteSnapshot(mastraPath, async (db) => {
      const tables = await tableNames(db);
      const threadRows = tables.has('mastra_threads')
        ? z
            .array(ThreadRowSchema)
            .parse(
              await db.getAll(
                'SELECT "id", "resourceId", "title", "metadata", "createdAt", "updatedAt" FROM "mastra_threads"',
              ),
            )
        : [];
      const messageRows = tables.has('mastra_messages')
        ? z
            .array(MessageRowSchema)
            .parse(
              await db.getAll(
                'SELECT "id", "thread_id", "content", "role", "type", "createdAt", "resourceId" FROM "mastra_messages"',
              ),
            )
        : [];
      return buildArchive(threadRows, messageRows, resolveExportReference);
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyArchive();
    throw error;
  }
}

function buildArchive(
  threadRows: readonly ThreadRow[],
  messageRows: readonly MessageRow[],
  resolveExportReference: (threadId: string) => string,
): DesktopMessageArchive {
  const messagesByThread = new Map<string, MessageRow[]>();
  for (const message of messageRows) {
    const list = messagesByThread.get(message.thread_id);
    if (list) list.push(message);
    else messagesByThread.set(message.thread_id, [message]);
  }

  const entries: { threadId: string; ref: string; messages: ArchiveMessageLineV1[] }[] = [];
  const threadLines = new Map<string, ArchiveLineV1>();

  for (const thread of threadRows) {
    let ref: string;
    try {
      ref = resolveExportReference(thread.id);
    } catch {
      // No live conversation shell: leave it to the inventory orphan blocker.
      continue;
    }
    const messages = messagesByThread.get(thread.id) ?? [];
    if (messages.length === 0) continue;

    const ordered = [...messages].sort((left, right) =>
      compareMessageOrder(
        { createdAt: mastraTimestampToMs(left.createdAt), id: left.id },
        { createdAt: mastraTimestampToMs(right.createdAt), id: right.id },
      ),
    );
    const lines: ArchiveMessageLineV1[] = ordered.map((message, ordinal) => ({
      k: 'message',
      v: 1,
      ref,
      ordinal,
      sid: message.id,
      role: message.role,
      type: message.type,
      content: message.content,
      createdAt: mastraTimestampToMs(message.createdAt),
    }));

    threadLines.set(ref, {
      k: 'thread',
      v: 1,
      ref,
      createdAt: mastraTimestampToMs(thread.createdAt),
      updatedAt: mastraTimestampToMs(thread.updatedAt),
    });
    entries.push({ threadId: thread.id, ref, messages: lines });
  }

  entries.sort((left, right) => (left.ref < right.ref ? -1 : left.ref > right.ref ? 1 : 0));

  const lines: ArchiveLineV1[] = [];
  const manifestEntries: ArchiveThreadManifestEntry[] = [];
  const refsByThreadId: DesktopMessageThreadRef[] = [];
  for (const entry of entries) {
    lines.push(threadLines.get(entry.ref)!);
    lines.push(...entry.messages);
    manifestEntries.push(computeThreadManifestEntry(entry.ref, entry.messages));
    refsByThreadId.push({ threadId: entry.threadId, ref: entry.ref });
  }

  return {
    manifest: computeArchiveManifest(manifestEntries),
    lines,
    refsByThreadId,
  };
}

/** Default codec: gzip keeps multi-megabyte transcripts well under the chunk budget. */
export const DESKTOP_MESSAGE_ARCHIVE_CODEC: ProfileImportArchiveCodec = 'ndjson+gzip';

export interface EncodedDesktopMessageArchive {
  readonly manifest: ArchiveManifest;
  readonly codec: ProfileImportArchiveCodec;
  readonly uncompressedBytes: number;
  readonly chunks: readonly Buffer[];
}

export function encodeDesktopMessageArchive(
  archive: DesktopMessageArchive,
  codec: ProfileImportArchiveCodec = DESKTOP_MESSAGE_ARCHIVE_CODEC,
): EncodedDesktopMessageArchive {
  const text = archive.lines.map((line) => JSON.stringify(line)).join('\n');
  const ndjson = Buffer.from(text.length ? `${text}\n` : '', 'utf8');
  if (ndjson.byteLength === 0) throw new Error('PROFILE_MESSAGE_ARCHIVE_EMPTY');
  const bytes = codec === 'ndjson+gzip' ? gzipSync(ndjson) : ndjson;
  const chunks: Buffer[] = [];
  for (
    let offset = 0;
    offset < bytes.byteLength;
    offset += PROFILE_IMPORT_ARCHIVE_MAX_CHUNK_BYTES
  ) {
    chunks.push(bytes.subarray(offset, offset + PROFILE_IMPORT_ARCHIVE_MAX_CHUNK_BYTES));
  }
  return {
    manifest: archive.manifest,
    codec,
    uncompressedBytes: ndjson.byteLength,
    chunks,
  };
}

export function messageChunkDigest(chunk: Buffer): string {
  return createHash('sha256').update(chunk).digest('hex');
}

export function createDesktopMessageExportPort(
  mastraPath: string | null,
): DesktopMessageExportPort {
  let lastArchive: DesktopMessageArchive | null = null;
  return {
    get lastArchive() {
      return lastArchive;
    },
    async readArchive(_identityId, resolveExportReference) {
      lastArchive = await readDesktopMessageArchive(mastraPath, resolveExportReference);
      return lastArchive;
    },
  };
}

/**
 * Export-only desktop capability. Messages are imported by the server Profile
 * import and never applied on the desktop, so import paths fail closed.
 */
export class DesktopConversationMessagesPortableCapability implements PortableCapability<ArchiveManifest> {
  readonly key = AI_CONVERSATION_MESSAGES_CAPABILITY.key;
  readonly schemaVersion = AI_CONVERSATION_MESSAGES_CAPABILITY.schemaVersion;
  readonly dependsOn = AI_CONVERSATION_MESSAGES_CAPABILITY.dependsOn;
  readonly payloadSchema = AIConversationMessagesPortablePayloadV1Schema;

  constructor(private readonly port: DesktopMessageExportPort) {}

  async export(context: PortableCapabilityExecutionContext): Promise<ArchiveManifest | null> {
    const archive = await this.port.readArchive(context.identityId, (threadId) =>
      context.references.resolveExportReference('ai-conversations', threadId),
    );
    return archive.manifest.archive.messages === 0 ? null : archive.manifest;
  }

  async dryRun(): Promise<PortableCapabilityReceipt> {
    throw new Error('PROFILE_MESSAGES_IMPORT_SERVER_ONLY');
  }

  async apply(): Promise<PortableCapabilityReceipt> {
    throw new Error('PROFILE_MESSAGES_IMPORT_SERVER_ONLY');
  }
}

export function createDesktopConversationMessagesPortableCapability(
  port: DesktopMessageExportPort,
): DesktopConversationMessagesPortableCapability {
  return new DesktopConversationMessagesPortableCapability(port);
}
