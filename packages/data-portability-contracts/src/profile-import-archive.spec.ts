import { describe, expect, it } from 'vitest';
import {
  PROFILE_IMPORT_ARCHIVE_MAX_CHUNK_BYTES,
  PROFILE_IMPORT_ARCHIVE_MAX_CONTENT_BYTES,
  PROFILE_IMPORT_ARCHIVE_MAX_MESSAGES,
  PROFILE_IMPORT_ARCHIVE_MAX_THREAD_MESSAGES,
  PROFILE_IMPORT_ARCHIVE_MAX_UNCOMPRESSED_BYTES,
  ProfileImportArchiveChunkRequestSchema,
  ProfileImportArchiveChunkResponseSchema,
  ProfileImportArchiveCompleteRequestSchema,
  ProfileImportArchiveCompleteResponseSchema,
  ProfileImportArchivePrepareRequestSchema,
  ProfileImportArchivePrepareResponseSchema,
} from './profile-import-archive';

const digest = 'a'.repeat(64);

const prepareRequest = {
  archiveDigest: digest,
  codec: 'ndjson' as const,
  chunkCount: 3,
  uncompressedBytes: 1024,
};

const manifest = {
  archive: { digest, threads: 1, messages: 2 },
  threads: [{ conversationRef: 'ai-conversations:1', messageCount: 2, digest }],
};

describe('Profile import archive limits', () => {
  it('uses the #865 §2.6 decision values', () => {
    expect(PROFILE_IMPORT_ARCHIVE_MAX_UNCOMPRESSED_BYTES).toBe(64 * 1024 * 1024);
    expect(PROFILE_IMPORT_ARCHIVE_MAX_MESSAGES).toBe(100_000);
    expect(PROFILE_IMPORT_ARCHIVE_MAX_THREAD_MESSAGES).toBe(50_000);
    expect(PROFILE_IMPORT_ARCHIVE_MAX_CONTENT_BYTES).toBe(1024 * 1024);
    expect(PROFILE_IMPORT_ARCHIVE_MAX_CHUNK_BYTES).toBe(96 * 1024);
  });
});

describe('Profile import archive prepare DTO', () => {
  it('accepts both codecs and rejects invalid or unknown fields', () => {
    expect(ProfileImportArchivePrepareRequestSchema.parse(prepareRequest)).toEqual(prepareRequest);
    expect(
      ProfileImportArchivePrepareRequestSchema.safeParse({
        ...prepareRequest,
        codec: 'ndjson+gzip',
      }).success,
    ).toBe(true);

    for (const invalid of [
      { ...prepareRequest, codec: 'gzip' },
      { ...prepareRequest, chunkCount: 0 },
      { ...prepareRequest, chunkCount: 1.5 },
      { ...prepareRequest, uncompressedBytes: -1 },
      { ...prepareRequest, archiveDigest: 'A'.repeat(64) },
      { ...prepareRequest, extra: true },
    ]) {
      expect(ProfileImportArchivePrepareRequestSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('returns the received chunk indexes and archive state', () => {
    const response = { archiveState: 'partial' as const, receivedChunkIndexes: [0, 2] };
    expect(ProfileImportArchivePrepareResponseSchema.parse(response)).toEqual(response);
    expect(
      ProfileImportArchivePrepareResponseSchema.safeParse({
        ...response,
        receivedChunkIndexes: [-1],
      }).success,
    ).toBe(false);
    expect(
      ProfileImportArchivePrepareResponseSchema.safeParse({ ...response, extra: true }).success,
    ).toBe(false);
  });
});

describe('Profile import archive chunk DTO', () => {
  it('accepts a base64 chunk and rejects malformed identity fields', () => {
    const chunk = { index: 0, digest, data: 'eyJrIjoidGhyZWFkIn0=' };
    expect(ProfileImportArchiveChunkRequestSchema.parse(chunk)).toEqual(chunk);
    for (const invalid of [
      { ...chunk, index: -1 },
      { ...chunk, digest: 'not-a-digest' },
      { ...chunk, data: '' },
      { ...chunk, extra: true },
    ]) {
      expect(ProfileImportArchiveChunkRequestSchema.safeParse(invalid).success).toBe(false);
    }
    expect(
      ProfileImportArchiveChunkResponseSchema.parse({
        archiveState: 'partial',
        receivedChunkIndexes: [0],
      }),
    ).toEqual({ archiveState: 'partial', receivedChunkIndexes: [0] });
  });
});

describe('Profile import archive complete DTO', () => {
  it('requires an empty request body', () => {
    expect(ProfileImportArchiveCompleteRequestSchema.parse({})).toEqual({});
    expect(ProfileImportArchiveCompleteRequestSchema.safeParse({ extra: true }).success).toBe(
      false,
    );
  });

  it('returns the completed state with a self-consistent computed manifest', () => {
    const response = { archiveState: 'complete' as const, computedManifest: manifest };
    expect(ProfileImportArchiveCompleteResponseSchema.parse(response)).toEqual(response);

    expect(
      ProfileImportArchiveCompleteResponseSchema.safeParse({
        archiveState: 'partial',
        computedManifest: manifest,
      }).success,
    ).toBe(false);
    expect(
      ProfileImportArchiveCompleteResponseSchema.safeParse({
        archiveState: 'complete',
        computedManifest: { ...manifest, archive: { ...manifest.archive, messages: 1 } },
      }).success,
    ).toBe(false);
    expect(
      ProfileImportArchiveCompleteResponseSchema.safeParse({
        ...response,
        extra: true,
      }).success,
    ).toBe(false);
  });
});
