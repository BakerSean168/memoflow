import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { createProfileImportArchiveStore, createProfileImportArchiveSweep } from './prisma-profile-import-archive';
import {
  buildArchiveFixture,
  createFakeProfileImportDb,
  sha256Hex,
  stageArchive,
} from './__tests__/profile-import-archive-harness';

const identity = 'account-1';
const requestId = 'request-archive-1';

function context() {
  const fake = createFakeProfileImportDb();
  return { ...fake, store: createProfileImportArchiveStore(fake.db) };
}

describe('Profile import archive staging', () => {
  it('prepare is idempotent and rejects a changed codec or archive digest', async () => {
    const { store } = context();
    const fixture = buildArchiveFixture();
    const input = {
      archiveDigest: fixture.manifest.archive.digest,
      codec: 'ndjson' as const,
      chunkCount: 2,
      uncompressedBytes: Buffer.byteLength(fixture.text),
    };

    const first = await store.prepare(identity, requestId, input);
    expect(first).toEqual({ archiveState: 'partial', receivedChunkIndexes: [] });

    const replay = await store.prepare(identity, requestId, input);
    expect(replay).toEqual(first);

    await expect(
      store.prepare(identity, requestId, { ...input, codec: 'ndjson+gzip' }),
    ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_MISMATCH' });
    await expect(
      store.prepare(identity, requestId, { ...input, archiveDigest: 'a'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_MISMATCH' });
  });

  it('prepare rejects a declared archive above the decompressed limit', async () => {
    const { store } = context();
    await expect(
      store.prepare(identity, requestId, {
        archiveDigest: 'a'.repeat(64),
        codec: 'ndjson',
        chunkCount: 1,
        uncompressedBytes: 64 * 1024 * 1024 + 1,
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_LIMIT_EXCEEDED' });
  });

  it('rewrites the same chunk digest idempotently and rejects a different digest', async () => {
    const { store } = context();
    const fixture = buildArchiveFixture();
    const bytes = Buffer.from(fixture.text, 'utf8');
    await store.prepare(identity, requestId, {
      archiveDigest: fixture.manifest.archive.digest,
      codec: 'ndjson',
      chunkCount: 1,
      uncompressedBytes: bytes.byteLength,
    });

    const chunk = { index: 0, digest: sha256Hex(bytes), data: bytes.toString('base64') };
    await store.putChunk(identity, requestId, chunk);
    const replay = await store.putChunk(identity, requestId, chunk);
    expect(replay.receivedChunkIndexes).toEqual([0]);

    const other = Buffer.from('{"k":"thread","v":1,"ref":"ai-conversations:9","createdAt":1,"updatedAt":1}\n');
    await expect(
      store.putChunk(identity, requestId, {
        index: 0,
        digest: sha256Hex(other),
        data: other.toString('base64'),
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_MISMATCH' });
  });

  it('rejects a chunk above 96 KiB and a digest that does not match its bytes', async () => {
    const { store } = context();
    const fixture = buildArchiveFixture();
    await store.prepare(identity, requestId, {
      archiveDigest: fixture.manifest.archive.digest,
      codec: 'ndjson',
      chunkCount: 2,
      uncompressedBytes: Buffer.byteLength(fixture.text),
    });

    const oversized = Buffer.alloc(96 * 1024 + 1, 1);
    await expect(
      store.putChunk(identity, requestId, {
        index: 0,
        digest: sha256Hex(oversized),
        data: oversized.toString('base64'),
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_LIMIT_EXCEEDED' });

    await expect(
      store.putChunk(identity, requestId, {
        index: 0,
        digest: 'b'.repeat(64),
        data: Buffer.from('x').toString('base64'),
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_MISMATCH' });
  });

  it('rejects a write after the archive is complete', async () => {
    const { store } = context();
    const fixture = buildArchiveFixture();
    await stageArchive(store, identity, requestId, fixture);
    const bytes = Buffer.from(fixture.text, 'utf8');
    await expect(
      store.putChunk(identity, requestId, {
        index: 0,
        digest: sha256Hex(bytes),
        data: bytes.toString('base64'),
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_MISMATCH' });
  });

  it('complete requires every chunk and a matching recomputed archive digest', async () => {
    const { store } = context();
    const fixture = buildArchiveFixture();
    const bytes = Buffer.from(fixture.text, 'utf8');

    await store.prepare(identity, requestId, {
      archiveDigest: fixture.manifest.archive.digest,
      codec: 'ndjson',
      chunkCount: 2,
      uncompressedBytes: bytes.byteLength,
    });
    await store.putChunk(identity, requestId, {
      index: 0,
      digest: sha256Hex(bytes),
      data: bytes.toString('base64'),
    });
    await expect(store.complete(identity, requestId)).rejects.toMatchObject({
      code: 'IMPORT_ARCHIVE_MISMATCH',
    });

    const tampered = buildArchiveFixture();
    await expect(
      stageArchive(store, identity, 'request-archive-tampered', {
        ...tampered,
        text: tampered.text.replace('message 0', 'tampered'),
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_MISMATCH' });
  });

  it('decompresses a gzipped archive before recomputing the manifest', async () => {
    const { store } = context();
    const fixture = buildArchiveFixture();
    const compressed = gzipSync(Buffer.from(fixture.text, 'utf8'));
    await store.prepare(identity, requestId, {
      archiveDigest: fixture.manifest.archive.digest,
      codec: 'ndjson+gzip',
      chunkCount: 1,
      uncompressedBytes: Buffer.byteLength(fixture.text),
    });
    await store.putChunk(identity, requestId, {
      index: 0,
      digest: sha256Hex(compressed),
      data: compressed.toString('base64'),
    });
    const result = await store.complete(identity, requestId);
    expect(result.computedManifest).toEqual(fixture.manifest);
  });

  it('complete persists the recomputed manifest and parsed rows', async () => {
    const { store, archives } = context();
    const fixture = buildArchiveFixture();
    await stageArchive(store, identity, requestId, fixture);

    const archive = [...archives.values()][0]!;
    expect(archive.archiveState).toBe('complete');
    expect(JSON.parse(String(archive.computedManifest))).toEqual(fixture.manifest);
    const parsed = JSON.parse(String(archive.parsedContent)) as {
      threads: unknown[];
      messages: unknown[];
    };
    expect(parsed.threads).toHaveLength(1);
    expect(parsed.messages).toHaveLength(2);

    const again = await store.complete(identity, requestId);
    expect(again.computedManifest).toEqual(fixture.manifest);
    expect(again.archiveState).toBe('complete');
  });

  it('enforces the per-message content byte limit without truncation', async () => {
    const { store } = context();
    const fixture = buildArchiveFixture();
    const oversized = Buffer.alloc(1024 * 1024 + 1, 97).toString('utf8');
    const lines = [
      JSON.stringify(fixture.thread),
      JSON.stringify({ ...fixture.messages[0], ordinal: 0, content: oversized }),
    ].join('\n');
    const bytes = Buffer.from(lines, 'utf8');
    const parts: Buffer[] = [];
    for (let offset = 0; offset < bytes.byteLength; offset += 96 * 1024) {
      parts.push(bytes.subarray(offset, offset + 96 * 1024));
    }
    await store.prepare(identity, requestId, {
      archiveDigest: 'c'.repeat(64),
      codec: 'ndjson',
      chunkCount: parts.length,
      uncompressedBytes: bytes.byteLength,
    });
    for (const [index, part] of parts.entries()) {
      await store.putChunk(identity, requestId, {
        index,
        digest: sha256Hex(part),
        data: part.toString('base64'),
      });
    }
    await expect(store.complete(identity, requestId)).rejects.toMatchObject({
      code: 'IMPORT_LIMIT_EXCEEDED',
    });
  });

  it('sweeps only staging older than 72 hours', async () => {
    const fake = createFakeProfileImportDb();
    const store = createProfileImportArchiveStore(fake.db);
    const fixture = buildArchiveFixture();
    const input = {
      archiveDigest: fixture.manifest.archive.digest,
      codec: 'ndjson' as const,
      chunkCount: 1,
      uncompressedBytes: Buffer.byteLength(fixture.text),
    };
    await store.prepare(identity, 'request-old', input);
    await store.prepare(identity, 'request-new', input);
    const now = new Date('2026-11-09T00:00:00.000Z');
    const old = [...fake.archives.values()].find((row) => row.requestId === 'request-old')!;
    old.createdAt = new Date(now.getTime() - 73 * 60 * 60 * 1000);

    const sweep = createProfileImportArchiveSweep(fake.db, { now: () => now });
    expect(await sweep.sweep()).toBe(1);
    expect(
      [...fake.archives.values()].map((row) => row.requestId),
    ).toEqual(['request-new']);
    expect(fake.operations.size).toBe(0);
  });
});
