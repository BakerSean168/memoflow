import { createHash } from 'node:crypto';
import { gunzip } from 'node:zlib';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@memoflow/database';
import {
  ArchiveLineV1Schema,
  ArchiveMessageLineV1Schema,
  ArchiveThreadLineV1Schema,
  computeArchiveManifest,
  computeThreadManifestEntry,
  type ArchiveMessageLineV1,
  type ArchiveThreadLineV1,
} from '@memoflow/ai-contracts/portable-messages-archive';
import {
  PROFILE_IMPORT_ARCHIVE_MAX_CHUNK_BYTES,
  PROFILE_IMPORT_ARCHIVE_MAX_CONTENT_BYTES,
  PROFILE_IMPORT_ARCHIVE_MAX_MESSAGES,
  PROFILE_IMPORT_ARCHIVE_MAX_THREAD_MESSAGES,
  PROFILE_IMPORT_ARCHIVE_MAX_UNCOMPRESSED_BYTES,
  ProfileImportArchiveChunkRequestSchema,
  ProfileImportArchiveChunkResponseSchema,
  ProfileImportArchiveCompleteResponseSchema,
  ProfileImportArchivePrepareRequestSchema,
  ProfileImportArchivePrepareResponseSchema,
  type ArchiveManifest,
  type ArchiveThreadManifestEntry,
  type ProfileImportArchiveChunkRequest,
  type ProfileImportArchiveChunkResponse,
  type ProfileImportArchiveCompleteResponse,
  type ProfileImportArchivePrepareRequest,
  type ProfileImportArchivePrepareResponse,
} from '@memoflow/data-portability-contracts';
import { ProfileImportError } from '../application/profile-import-error';
import { profileImportDigest } from '../application/profile-import-manifest';

/** Prisma client or transaction: both expose the same model delegates. */
type ArchiveDatabase = PrismaClient | Prisma.TransactionClient;

/** Persisted rows are re-validated on load so staging corruption fails closed. */
const ArchiveThreadLinesSchema = z.array(ArchiveThreadLineV1Schema);
const ArchiveMessageLinesSchema = z.array(ArchiveMessageLineV1Schema);

/** Parsed archive rows handed to the message capability at commit time. */
export interface ProfileImportArchiveRows {
  readonly threads: readonly ArchiveThreadLineV1[];
  readonly messages: readonly ArchiveMessageLineV1[];
}

interface ArchiveRecord {
  readonly id: string;
  readonly archiveDigest: string;
  readonly codec: string;
  readonly chunkCount: number;
  readonly uncompressedBytes: number;
  readonly archiveState: string;
  readonly computedManifest: string | null;
  readonly parsedContent: string | null;
}

const sha256Hex = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

function decodeBase64(data: string): Buffer {
  const bytes = Buffer.from(data, 'base64');
  if (
    bytes.length === 0 ||
    bytes.toString('base64').replace(/=+$/, '') !== data.replace(/=+$/, '')
  ) {
    throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
  }
  return bytes;
}

function gunzipBounded(bytes: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    gunzip(
      bytes,
      { maxOutputLength: PROFILE_IMPORT_ARCHIVE_MAX_UNCOMPRESSED_BYTES },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
  });
}

async function decodeArchive(bytes: Buffer, codec: string): Promise<Buffer> {
  if (codec === 'ndjson') {
    if (bytes.byteLength > PROFILE_IMPORT_ARCHIVE_MAX_UNCOMPRESSED_BYTES) {
      throw new ProfileImportError('IMPORT_LIMIT_EXCEEDED');
    }
    return bytes;
  }
  if (codec !== 'ndjson+gzip') throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
  try {
    return await gunzipBounded(bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') {
      throw new ProfileImportError('IMPORT_LIMIT_EXCEEDED');
    }
    throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
  }
}

interface ParsedArchive {
  readonly threads: ArchiveThreadLineV1[];
  readonly messages: ArchiveMessageLineV1[];
  readonly manifest: ArchiveManifest;
}

/**
 * Parse the NDJSON archive and recompute its manifest with the shared
 * canonicalizer. Every limit is enforced without truncation.
 */
function parseArchive(text: string, archiveDigest: string): ParsedArchive {
  const threads: ArchiveThreadLineV1[] = [];
  const messages: ArchiveMessageLineV1[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line) as unknown;
    } catch {
      throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
    }
    const parsed = ArchiveLineV1Schema.safeParse(raw);
    if (!parsed.success) throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
    if (parsed.data.k === 'thread') {
      threads.push(parsed.data);
      continue;
    }
    if (messages.length >= PROFILE_IMPORT_ARCHIVE_MAX_MESSAGES) {
      throw new ProfileImportError('IMPORT_LIMIT_EXCEEDED');
    }
    if (Buffer.byteLength(parsed.data.content, 'utf8') > PROFILE_IMPORT_ARCHIVE_MAX_CONTENT_BYTES) {
      throw new ProfileImportError('IMPORT_LIMIT_EXCEEDED');
    }
    messages.push(parsed.data);
  }

  const refs = new Set(threads.map((thread) => thread.ref));
  if (refs.size !== threads.length) throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');

  const byRef = new Map<string, ArchiveMessageLineV1[]>(threads.map((thread) => [thread.ref, []]));
  for (const message of messages) {
    const bucket = byRef.get(message.ref);
    if (!bucket) throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
    bucket.push(message);
  }

  const entries: ArchiveThreadManifestEntry[] = [];
  for (const thread of threads) {
    const bucket = byRef.get(thread.ref)!;
    bucket.sort((left, right) => left.ordinal - right.ordinal);
    if (bucket.length > PROFILE_IMPORT_ARCHIVE_MAX_THREAD_MESSAGES) {
      throw new ProfileImportError('IMPORT_LIMIT_EXCEEDED');
    }
    bucket.forEach((message, index) => {
      if (message.ordinal !== index) throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
    });
    entries.push(computeThreadManifestEntry(thread.ref, bucket));
  }

  const manifest = computeArchiveManifest(entries);
  if (manifest.archive.digest !== archiveDigest) {
    throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
  }

  const orderedThreads = [...threads].sort((left, right) =>
    left.ref < right.ref ? -1 : left.ref > right.ref ? 1 : 0,
  );
  const orderedMessages = [...messages].sort(
    (left, right) =>
      (left.ref < right.ref ? -1 : left.ref > right.ref ? 1 : 0) || left.ordinal - right.ordinal,
  );
  return { threads: orderedThreads, messages: orderedMessages, manifest };
}

function archiveId(identityId: string, requestId: string): string {
  return `profile-import-archive-${profileImportDigest([identityId, requestId])}`;
}

function receivedIndexes(chunks: readonly { index: number }[]): number[] {
  return chunks.map((chunk) => chunk.index).sort((left, right) => left - right);
}

function prepareResponse(
  state: 'partial' | 'complete',
  chunks: readonly { index: number }[],
): ProfileImportArchivePrepareResponse {
  return ProfileImportArchivePrepareResponseSchema.parse({
    archiveState: state,
    receivedChunkIndexes: receivedIndexes(chunks),
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === 'P2002';
}

/**
 * Archive staging repository for Profile imports.
 *
 * The three archive routes only move bytes and derive a manifest; they never
 * write business facts. Commit reads the persisted parse result instead of
 * re-parsing client bytes (#865 §2.6, §3.3).
 */
export function createProfileImportArchiveStore(db: PrismaClient) {
  const whereRequest = (identityId: string, requestId: string) => ({
    identityId_requestId: { identityId, requestId },
  });

  async function findArchive(
    client: ArchiveDatabase,
    identityId: string,
    requestId: string,
  ): Promise<ArchiveRecord | null> {
    return client.profileImportArchive.findUnique({ where: whereRequest(identityId, requestId) });
  }

  async function chunksOf(client: ArchiveDatabase, id: string) {
    return client.profileImportArchiveChunk.findMany({
      where: { archiveId: id },
      select: { index: true },
    });
  }

  return {
    async prepare(
      identityId: string,
      requestId: string,
      raw: ProfileImportArchivePrepareRequest,
    ): Promise<ProfileImportArchivePrepareResponse> {
      const input = ProfileImportArchivePrepareRequestSchema.parse(raw);
      if (input.uncompressedBytes > PROFILE_IMPORT_ARCHIVE_MAX_UNCOMPRESSED_BYTES) {
        throw new ProfileImportError('IMPORT_LIMIT_EXCEEDED');
      }
      const existing = await findArchive(db, identityId, requestId);
      if (existing) {
        // A repeated prepare must describe the same archive; changing the codec,
        // digest or chunking would make the already staged bytes unusable.
        if (
          existing.archiveDigest !== input.archiveDigest ||
          existing.codec !== input.codec ||
          existing.chunkCount !== input.chunkCount ||
          existing.uncompressedBytes !== input.uncompressedBytes
        ) {
          throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
        }
        return prepareResponse(existing.archiveState as 'partial' | 'complete', await chunksOf(db, existing.id));
      }
      try {
        const created = await db.profileImportArchive.create({
          data: {
            id: archiveId(identityId, requestId),
            identityId,
            requestId,
            ...input,
            archiveState: 'partial',
          },
        });
        return prepareResponse('partial', await chunksOf(db, created.id));
      } catch (error) {
        // A concurrent prepare for the same request wins; validate against it.
        if (!isUniqueViolation(error)) throw error;
        const raced = await findArchive(db, identityId, requestId);
        if (!raced) throw error;
        if (
          raced.archiveDigest !== input.archiveDigest ||
          raced.codec !== input.codec ||
          raced.chunkCount !== input.chunkCount ||
          raced.uncompressedBytes !== input.uncompressedBytes
        ) {
          throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
        }
        return prepareResponse(raced.archiveState as 'partial' | 'complete', await chunksOf(db, raced.id));
      }
    },

    async putChunk(
      identityId: string,
      requestId: string,
      raw: ProfileImportArchiveChunkRequest,
    ): Promise<ProfileImportArchiveChunkResponse> {
      const input = ProfileImportArchiveChunkRequestSchema.parse(raw);
      const bytes = decodeBase64(input.data);
      if (bytes.byteLength > PROFILE_IMPORT_ARCHIVE_MAX_CHUNK_BYTES) {
        throw new ProfileImportError('IMPORT_LIMIT_EXCEEDED');
      }
      if (sha256Hex(bytes) !== input.digest) {
        throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
      }
      return db.$transaction(async (tx) => {
        const archive = await findArchive(tx, identityId, requestId);
        if (!archive) throw new ProfileImportError('IMPORT_ARCHIVE_UNAVAILABLE');
        // A completed archive is immutable. IMPORT_ARCHIVE_MISMATCH is the
        // existing stable conflict code for "bytes are no longer accepted".
        if (archive.archiveState === 'complete') {
          throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
        }
        if (input.index >= archive.chunkCount) {
          throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
        }
        const existing = await tx.profileImportArchiveChunk.findUnique({
          where: { archiveId_index: { archiveId: archive.id, index: input.index } },
        });
        if (existing) {
          if (existing.digest !== input.digest) {
            throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
          }
          // Same index and digest means identical bytes; rewrite idempotently.
          await tx.profileImportArchiveChunk.update({
            where: { archiveId_index: { archiveId: archive.id, index: input.index } },
            data: { bytes: new Uint8Array(bytes) },
          });
        } else {
          try {
            await tx.profileImportArchiveChunk.create({
              data: {
                archiveId: archive.id,
                index: input.index,
                digest: input.digest,
                bytes: new Uint8Array(bytes),
              },
            });
          } catch (error) {
            if (!isUniqueViolation(error)) throw error;
            throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
          }
        }
        return ProfileImportArchiveChunkResponseSchema.parse({
          archiveState: 'partial',
          receivedChunkIndexes: receivedIndexes(await chunksOf(tx, archive.id)),
        });
      });
    },

    async complete(
      identityId: string,
      requestId: string,
    ): Promise<ProfileImportArchiveCompleteResponse> {
      const archive = await findArchive(db, identityId, requestId);
      if (!archive) throw new ProfileImportError('IMPORT_ARCHIVE_UNAVAILABLE');
      if (archive.archiveState === 'complete') {
        return ProfileImportArchiveCompleteResponseSchema.parse({
          archiveState: 'complete',
          computedManifest: JSON.parse(archive.computedManifest ?? 'null'),
        });
      }

      const chunks = await db.profileImportArchiveChunk.findMany({
        where: { archiveId: archive.id },
        orderBy: { index: 'asc' },
      });
      if (chunks.length !== archive.chunkCount) {
        throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
      }
      const parts: Buffer[] = [];
      chunks.forEach((chunk, index) => {
        if (chunk.index !== index) throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
        const bytes = Buffer.from(chunk.bytes);
        if (sha256Hex(bytes) !== chunk.digest) {
          throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
        }
        parts.push(bytes);
      });

      // Decompression/parsing deliberately runs outside any import lock; the
      // final state transition is conditional so a repeated complete is safe.
      const uncompressed = await decodeArchive(Buffer.concat(parts), archive.codec);
      const parsed = parseArchive(uncompressed.toString('utf8'), archive.archiveDigest);

      const updated = await db.profileImportArchive.updateMany({
        where: { id: archive.id, archiveState: 'partial' },
        data: {
          archiveState: 'complete',
          computedManifest: JSON.stringify(parsed.manifest),
          parsedContent: JSON.stringify({ threads: parsed.threads, messages: parsed.messages }),
        },
      });
      if (updated.count === 0) {
        const latest = await findArchive(db, identityId, requestId);
        if (latest?.archiveState === 'complete') {
          return ProfileImportArchiveCompleteResponseSchema.parse({
            archiveState: 'complete',
            computedManifest: JSON.parse(latest.computedManifest ?? 'null'),
          });
        }
        throw new ProfileImportError('IMPORT_ARCHIVE_MISMATCH');
      }
      return ProfileImportArchiveCompleteResponseSchema.parse({
        archiveState: 'complete',
        computedManifest: parsed.manifest,
      });
    },

    /** Load the persisted parse result for commit-time apply. Never re-parses bytes. */
    async loadParsedArchive(
      client: ArchiveDatabase,
      identityId: string,
      requestId: string,
    ): Promise<ProfileImportArchiveRows> {
      const archive = await findArchive(client, identityId, requestId);
      if (archive?.archiveState !== 'complete' || !archive.parsedContent) {
        throw new ProfileImportError('IMPORT_ARCHIVE_UNAVAILABLE');
      }
      const raw = JSON.parse(archive.parsedContent) as { threads: unknown; messages: unknown };
      return {
        threads: ArchiveThreadLinesSchema.parse(raw.threads),
        messages: ArchiveMessageLinesSchema.parse(raw.messages),
      };
    },

    /** Attach the archive to the operation once preflight has created it. */
    async attachOperation(
      client: ArchiveDatabase,
      identityId: string,
      requestId: string,
      operationId: string,
    ): Promise<void> {
      await client.profileImportArchive.updateMany({
        where: { identityId, requestId, operationId: null },
        data: { operationId },
      });
    },

    /** Delete staged chunks immediately after a committed operation. */
    async deleteChunks(
      client: ArchiveDatabase,
      identityId: string,
      requestId: string,
    ): Promise<void> {
      const archive = await findArchive(client, identityId, requestId);
      if (!archive) return;
      await client.profileImportArchiveChunk.deleteMany({ where: { archiveId: archive.id } });
    },

    async readComputedManifest(
      client: ArchiveDatabase,
      identityId: string,
      requestId: string,
    ): Promise<ArchiveManifest> {
      const archive = await findArchive(client, identityId, requestId);
      if (archive?.archiveState !== 'complete' || !archive.computedManifest) {
        throw new ProfileImportError('IMPORT_ARCHIVE_UNAVAILABLE');
      }
      return JSON.parse(archive.computedManifest) as ArchiveManifest;
    },
  };
}

export type ProfileImportArchiveStore = ReturnType<typeof createProfileImportArchiveStore>;

const PROFILE_IMPORT_ARCHIVE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const PROFILE_IMPORT_ARCHIVE_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * Delete staging older than 72 hours. Only archive rows are removed (chunks
 * cascade); business tables and operation status are never touched (§5.4).
 */
export function createProfileImportArchiveSweep(
  db: PrismaClient,
  options: { readonly now?: () => Date; readonly intervalMs?: number } = {},
) {
  const now = options.now ?? (() => new Date());
  const intervalMs = options.intervalMs ?? PROFILE_IMPORT_ARCHIVE_SWEEP_INTERVAL_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = true;
  let running: Promise<void> | undefined;

  async function sweep(): Promise<number> {
    const cutoff = new Date(now().getTime() - PROFILE_IMPORT_ARCHIVE_TTL_MS);
    const expired = await db.profileImportArchive.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: 100,
    });
    if (!expired.length) return 0;
    await db.profileImportArchive.deleteMany({
      where: { id: { in: expired.map((archive) => archive.id) } },
    });
    return expired.length;
  }

  function tick() {
    if (stopped) return;
    running = sweep()
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        running = undefined;
        if (!stopped) {
          timer = setTimeout(tick, intervalMs);
          timer.unref?.();
        }
      });
  }

  return {
    sweep,
    start() {
      if (!stopped) return;
      stopped = false;
      tick();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
    async drain() {
      await running;
    },
  };
}
