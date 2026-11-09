import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import {
  computeArchiveManifest,
  computeThreadManifestEntry,
  type ArchiveMessageLineV1,
} from '@memoflow/ai-contracts/portable-messages-archive';
import {
  encodeDesktopMessageArchive,
  messageChunkDigest,
  readDesktopMessageArchive,
} from './desktop-message-archive';

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'desktop-message-archive-'));
  mkdirSync(path.join(dir, 'storage'));
  const mastraPath = path.join(dir, 'storage/mastra.db');
  const db = new Database(mastraPath);
  db.exec(`
    CREATE TABLE mastra_threads (
      id TEXT PRIMARY KEY,
      resourceId TEXT,
      title TEXT,
      metadata TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE mastra_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT,
      content TEXT,
      role TEXT,
      type TEXT,
      createdAt TEXT,
      resourceId TEXT
    );
  `);
  db.prepare(
    'INSERT INTO mastra_threads (id, resourceId, title, metadata, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    'thread-1',
    'owner',
    'Conversation',
    null,
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:09.000Z',
  );
  const insertMessage = db.prepare(
    'INSERT INTO mastra_messages (id, thread_id, content, role, type, createdAt, resourceId) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  // Inserted out of order; export must order by createdAt, id and renumber ordinal.
  insertMessage.run(
    'm2',
    'thread-1',
    '{"format":2,"parts":[{"type":"text","text":"second"}]}',
    'assistant',
    'text',
    '2026-01-01T00:00:02.000Z',
    'owner',
  );
  insertMessage.run(
    'm1',
    'thread-1',
    '{"format":2,"parts":[{"type":"text","text":"first"}]}',
    'user',
    'text',
    '2026-01-01T00:00:01.000Z',
    'owner',
  );
  return {
    mastraPath,
    close: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

it('builds the NDJSON lines and manifest with the shared canonicalizer', async () => {
  const f = fixture();
  try {
    const archive = await readDesktopMessageArchive(f.mastraPath, () => 'ai-conversations:1');
    const expectedMessages: ArchiveMessageLineV1[] = [
      {
        k: 'message',
        v: 1,
        ref: 'ai-conversations:1',
        ordinal: 0,
        sid: 'm1',
        role: 'user',
        type: 'text',
        content: '{"format":2,"parts":[{"type":"text","text":"first"}]}',
        createdAt: Date.parse('2026-01-01T00:00:01.000Z'),
      },
      {
        k: 'message',
        v: 1,
        ref: 'ai-conversations:1',
        ordinal: 1,
        sid: 'm2',
        role: 'assistant',
        type: 'text',
        content: '{"format":2,"parts":[{"type":"text","text":"second"}]}',
        createdAt: Date.parse('2026-01-01T00:00:02.000Z'),
      },
    ];
    const expectedManifest = computeArchiveManifest([
      computeThreadManifestEntry('ai-conversations:1', expectedMessages),
    ]);
    expect(archive.manifest).toEqual(expectedManifest);
    expect(archive.lines).toEqual([
      {
        k: 'thread',
        v: 1,
        ref: 'ai-conversations:1',
        createdAt: Date.parse('2026-01-01T00:00:00.000Z'),
        updatedAt: Date.parse('2026-01-01T00:00:09.000Z'),
      },
      ...expectedMessages,
    ]);
    expect(archive.manifest.archive).toMatchObject({ threads: 1, messages: 2 });
    expect(archive.refsByThreadId).toEqual([{ threadId: 'thread-1', ref: 'ai-conversations:1' }]);
  } finally {
    f.close();
  }
});

it('skips threads without a live conversation shell', async () => {
  const f = fixture();
  try {
    const archive = await readDesktopMessageArchive(f.mastraPath, () => {
      throw new Error('no shell');
    });
    expect(archive.manifest.archive).toEqual({
      digest: expect.any(String),
      threads: 0,
      messages: 0,
    });
    expect(archive.lines).toEqual([]);
    expect(archive.refsByThreadId).toEqual([]);
  } finally {
    f.close();
  }
});

it('returns an empty archive when mastra.db is absent', async () => {
  const archive = await readDesktopMessageArchive(null, () => 'ai-conversations:1');
  expect(archive.manifest.archive).toMatchObject({ threads: 0, messages: 0 });
  expect(archive.lines).toEqual([]);
});

it('encodes ndjson and ndjson+gzip with chunks bounded by the contract limit', async () => {
  const f = fixture();
  try {
    const archive = await readDesktopMessageArchive(f.mastraPath, () => 'ai-conversations:1');
    const plain = encodeDesktopMessageArchive(archive, 'ndjson');
    expect(plain.codec).toBe('ndjson');
    expect(plain.uncompressedBytes).toBeGreaterThan(0);
    expect(plain.chunks).toHaveLength(1);
    expect(plain.chunks[0]!.toString('utf8')).toContain('"sid":"m1"');
    expect(messageChunkDigest(plain.chunks[0]!)).toMatch(/^[a-f0-9]{64}$/);

    const gzip = encodeDesktopMessageArchive(archive, 'ndjson+gzip');
    expect(gzip.codec).toBe('ndjson+gzip');
    expect(gzip.uncompressedBytes).toBe(plain.uncompressedBytes);
    expect(gzip.chunks[0]![0]).toBe(0x1f);
    expect(gzip.chunks[0]![1]).toBe(0x8b);
  } finally {
    f.close();
  }
});
