/**
 * Profile import archive transfer contract.
 *
 * The archive is the sidecar channel that carries AI messages for the
 * `ai-conversation-messages@1` capability. These three routes stage bytes and
 * never write business facts; the Profile import commit remains the only place
 * that applies messages (see #865 design §2.6 and §3).
 */
import { z } from 'zod';
import { ArchiveManifestSchema } from './archive-manifest';

/** Maximum decompressed archive size accepted by the staging routes. */
export const PROFILE_IMPORT_ARCHIVE_MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
/** Maximum message rows across the whole archive. */
export const PROFILE_IMPORT_ARCHIVE_MAX_MESSAGES = 100_000;
/** Maximum message rows in a single conversation. */
export const PROFILE_IMPORT_ARCHIVE_MAX_THREAD_MESSAGES = 50_000;
/** Maximum UTF-8 bytes of one message `content` value. */
export const PROFILE_IMPORT_ARCHIVE_MAX_CONTENT_BYTES = 1024 * 1024;
/** Maximum decoded bytes of one uploaded chunk (base64 payload sits under the 2 MB parser). */
export const PROFILE_IMPORT_ARCHIVE_MAX_CHUNK_BYTES = 96 * 1024;

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const ProfileImportArchiveCodecSchema = z.enum(['ndjson', 'ndjson+gzip']);
export type ProfileImportArchiveCodec = z.infer<typeof ProfileImportArchiveCodecSchema>;

export const ProfileImportArchiveStateSchema = z.enum(['partial', 'complete']);
export type ProfileImportArchiveState = z.infer<typeof ProfileImportArchiveStateSchema>;

const ReceivedChunkIndexesSchema = z.array(z.number().int().nonnegative());

export const ProfileImportArchivePrepareRequestSchema = z
  .object({
    archiveDigest: DigestSchema,
    codec: ProfileImportArchiveCodecSchema,
    chunkCount: z.number().int().positive(),
    uncompressedBytes: z.number().int().nonnegative(),
  })
  .strict();
export type ProfileImportArchivePrepareRequest = z.infer<
  typeof ProfileImportArchivePrepareRequestSchema
>;

export const ProfileImportArchivePrepareResponseSchema = z
  .object({
    archiveState: ProfileImportArchiveStateSchema,
    receivedChunkIndexes: ReceivedChunkIndexesSchema,
  })
  .strict();
export type ProfileImportArchivePrepareResponse = z.infer<
  typeof ProfileImportArchivePrepareResponseSchema
>;

export const ProfileImportArchiveChunkRequestSchema = z
  .object({
    index: z.number().int().nonnegative(),
    digest: DigestSchema,
    /** Base64-encoded chunk bytes; the service decodes and enforces the size limit. */
    data: z.string().min(1),
  })
  .strict();
export type ProfileImportArchiveChunkRequest = z.infer<
  typeof ProfileImportArchiveChunkRequestSchema
>;

export const ProfileImportArchiveChunkResponseSchema = z
  .object({
    archiveState: ProfileImportArchiveStateSchema,
    receivedChunkIndexes: ReceivedChunkIndexesSchema,
  })
  .strict();
export type ProfileImportArchiveChunkResponse = z.infer<
  typeof ProfileImportArchiveChunkResponseSchema
>;

/** `complete` carries no body; the operation is identified by the route. */
export const ProfileImportArchiveCompleteRequestSchema = z.object({}).strict();
export type ProfileImportArchiveCompleteRequest = z.infer<
  typeof ProfileImportArchiveCompleteRequestSchema
>;

export const ProfileImportArchiveCompleteResponseSchema = z
  .object({
    archiveState: z.literal('complete'),
    computedManifest: ArchiveManifestSchema,
  })
  .strict();
export type ProfileImportArchiveCompleteResponse = z.infer<
  typeof ProfileImportArchiveCompleteResponseSchema
>;
