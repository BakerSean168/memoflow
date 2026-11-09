import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import {
  computeArchiveManifest,
  computeThreadManifestEntry,
  type ArchiveMessageLineV1,
} from '@memoflow/ai-contracts/portable-messages-archive';
import type { ArchiveManifest } from '@memoflow/data-portability-contracts';
import { readProfileSqliteSnapshot } from './profile-sqlite-snapshot';
import {
  inspectProfileSource,
  type ProfileSourceMessageCoverage,
} from './profile-source-inventory';

it('blocks unhandled data and detects changed content even with unchanged size and timestamps', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'profile-inventory-'));
  const dbPath = path.join(dir, 'test.sqlite');
  const writer = new Database(dbPath);
  try {
    writer.exec(
      "CREATE TABLE future_owner (id TEXT, value TEXT); INSERT INTO future_owner VALUES ('one', 'abc')",
    );
    const file = path.join(dir, 'note.txt');
    writeFileSync(file, 'abc');
    utimesSync(file, 1, 1);
    const inspect = () => readProfileSqliteSnapshot(dbPath, (db) => inspectProfileSource(db, dir));
    const first = await inspect();
    expect(first.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'future_owner',
          reason: 'unsupported_user_data',
        }),
        expect.objectContaining({
          field: 'note.txt',
          reason: 'unsupported_user_data',
        }),
      ]),
    );
    writeFileSync(file, 'xyz');
    utimesSync(file, 1, 1);
    expect((await inspect()).digest).not.toBe(first.digest);
    writer.exec("UPDATE future_owner SET value = 'xyz'");
    expect((await inspect()).digest).not.toBe(first.digest);
  } finally {
    writer.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('allows an empty Mastra runtime database but retains any persisted user facts, including WAL data', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'profile-mastra-inventory-'));
  mkdirSync(path.join(dir, 'db'));
  mkdirSync(path.join(dir, 'storage'));
  const filename = path.join(dir, 'db/powersync.sqlite');
  const writer = new Database(filename);
  const mastra = new Database(path.join(dir, 'storage/mastra.db'));
  try {
    mastra.pragma('journal_mode = WAL');
    mastra.exec('CREATE TABLE messages (id TEXT, body BLOB)');
    const inspect = () =>
      readProfileSqliteSnapshot(filename, (db) => inspectProfileSource(db, dir));
    expect((await inspect()).blockers).toEqual([]);
    mastra.prepare('INSERT INTO messages VALUES (?, ?)').run('one', Buffer.from('private message'));
    expect((await inspect()).blockers).toContainEqual({
      capability: 'local-source',
      field: 'storage/mastra.db',
      reason: 'unsupported_user_data',
    });
  } finally {
    writer.close();
    mastra.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('treats local AI permission policy and audit tables as technical profile data', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'profile-permission-inventory-'));
  mkdirSync(path.join(dir, 'db'));
  const filename = path.join(dir, 'db/powersync.sqlite');
  const writer = new Database(filename);
  try {
    writer.exec(`
      CREATE TABLE ai_permission_settings_local (id TEXT PRIMARY KEY, record_json TEXT);
      CREATE TABLE ai_permission_rules_local (id TEXT PRIMARY KEY, record_json TEXT);
      CREATE TABLE ai_permission_audit_local (id TEXT PRIMARY KEY, record_json TEXT);
      INSERT INTO ai_permission_settings_local VALUES ('settings', '{"preset":"on_demand"}');
      INSERT INTO ai_permission_rules_local VALUES ('rule', '{"effect":"allow"}');
      INSERT INTO ai_permission_audit_local VALUES ('audit', '{"decision":"allow"}');
    `);
    const result = await readProfileSqliteSnapshot(filename, (db) => inspectProfileSource(db, dir));
    expect(result.blockers).toEqual([]);
  } finally {
    writer.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('retains symbolic links without following external directories or cycles', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'profile-link-inventory-'));
  mkdirSync(path.join(dir, 'db'));
  const filename = path.join(dir, 'db/powersync.sqlite');
  const writer = new Database(filename);
  try {
    symlinkSync(dir, path.join(dir, 'linked-vault'), 'dir');
    const result = await readProfileSqliteSnapshot(filename, (db) => inspectProfileSource(db, dir));
    expect(result.blockers).toContainEqual({
      capability: 'local-source',
      field: 'linked-vault',
      reason: 'unsupported_user_data',
    });
  } finally {
    writer.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('does not open Mastra through a linked external storage directory', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'profile-linked-storage-'));
  const dir = path.join(root, 'profile');
  const external = path.join(root, 'external');
  mkdirSync(path.join(dir, 'db'), { recursive: true });
  mkdirSync(external);
  const filename = path.join(dir, 'db/powersync.sqlite');
  const writer = new Database(filename);
  try {
    writeFileSync(
      path.join(external, 'mastra.db'),
      'external content must not be opened as SQLite',
    );
    symlinkSync(external, path.join(dir, 'storage'), 'dir');
    const result = await readProfileSqliteSnapshot(filename, (db) => inspectProfileSource(db, dir));
    expect(result.blockers).toContainEqual({
      capability: 'local-source',
      field: 'storage',
      reason: 'unsupported_user_data',
    });
  } finally {
    writer.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it('does not block startup epoch metadata and model catalog cache', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'profile-used-inventory-'));
  mkdirSync(path.join(dir, 'db'));
  mkdirSync(path.join(dir, 'storage/local-agents/model-catalog'), {
    recursive: true,
  });
  const filename = path.join(dir, 'db/powersync.sqlite');
  const writer = new Database(filename);
  const mastra = new Database(path.join(dir, 'storage/mastra.db'));
  try {
    mastra.exec(`CREATE TABLE memoflow_goal_event_meta(id INTEGER PRIMARY KEY CHECK(id=1), epoch TEXT NOT NULL);
      INSERT INTO memoflow_goal_event_meta VALUES (1, '00000000-0000-4000-8000-000000000865');`);
    writeFileSync(
      path.join(dir, 'storage/local-agents/model-catalog', 'a'.repeat(64) + '.json'),
      '{"revision":1,"status":{"status":"ready"}}',
    );
    const result = await readProfileSqliteSnapshot(filename, (db) => inspectProfileSource(db, dir));
    expect(result.blockers).toEqual([]);
    mastra.exec(
      "UPDATE memoflow_goal_event_meta SET epoch = '00000000-0000-4000-8000-000000000866'",
    );
    expect(
      (await readProfileSqliteSnapshot(filename, (db) => inspectProfileSource(db, dir))).digest,
    ).not.toBe(result.digest);
    mastra.exec("UPDATE memoflow_goal_event_meta SET epoch = 'invalid'");
    expect(
      (await readProfileSqliteSnapshot(filename, (db) => inspectProfileSource(db, dir))).blockers,
    ).toContainEqual(expect.objectContaining({ field: 'storage/mastra.db' }));
  } finally {
    writer.close();
    mastra.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('retains real Assistant Memory messages rather than treating conversation shells as their backup', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'profile-real-history-'));
  mkdirSync(path.join(dir, 'db'));
  mkdirSync(path.join(dir, 'storage'));
  const filename = path.join(dir, 'db/powersync.sqlite');
  const writer = new Database(filename);
  const storage = new LibSQLStore({
    id: 'inventory-regression',
    url: `file:${path.join(dir, 'storage/mastra.db')}`,
  });
  try {
    await storage.init();
    const memory = new Memory({ storage });
    await memory.createThread({
      threadId: 'source-conversation',
      resourceId: 'source-owner',
      title: 'Real local conversation',
    });
    await memory.saveMessages({
      messages: [
        {
          id: 'user-865',
          threadId: 'source-conversation',
          resourceId: 'source-owner',
          role: 'user',
          createdAt: new Date(),
          type: 'text',
          content: {
            format: 2,
            parts: [{ type: 'text', text: 'Keep this authoritative message' }],
          },
        },
      ],
    });
    await memory.settled();
    expect(
      (await memory.recall({ threadId: 'source-conversation', perPage: false })).messages,
    ).toEqual([expect.objectContaining({ role: 'user' })]);
    const result = await readProfileSqliteSnapshot(filename, (db) => inspectProfileSource(db, dir));
    expect(result.blockers).toContainEqual({
      capability: 'local-source',
      field: 'storage/mastra.db',
      reason: 'storage/mastra.db:orphan-thread',
    });
  } finally {
    await storage.close();
    writer.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('ignores only exact catalog cache names and keeps unknown files and symlinks', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'profile-catalog-'));
  mkdirSync(path.join(dir, 'db'));
  const catalog = path.join(dir, 'storage/local-agents/model-catalog');
  mkdirSync(catalog, { recursive: true });
  const filename = path.join(dir, 'db/powersync.sqlite');
  const writer = new Database(filename);
  try {
    const cache = 'a'.repeat(64) + '.json';
    writeFileSync(path.join(catalog, cache), '{}');
    writeFileSync(path.join(catalog, cache + '.00000000-0000-4000-8000-000000000865.tmp'), '{}');
    const inspect = () =>
      readProfileSqliteSnapshot(filename, (db) => inspectProfileSource(db, dir));
    const before = await inspect();
    expect(before.blockers).toEqual([]);
    writeFileSync(path.join(catalog, cache), '{"revision":2}');
    expect((await inspect()).digest).toBe(before.digest);
    for (const name of [cache + '.tmp', 'catalog.json', 'A'.repeat(64) + '.json']) {
      writeFileSync(path.join(catalog, name), '{}');
      expect((await inspect()).blockers).toContainEqual(
        expect.objectContaining({ field: 'storage/local-agents/model-catalog/' + name }),
      );
    }
    rmSync(path.join(catalog, cache));
    symlinkSync(filename, path.join(catalog, cache));
    expect((await inspect()).blockers).toContainEqual(
      expect.objectContaining({ field: 'storage/local-agents/model-catalog/' + cache }),
    );
  } finally {
    writer.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function mastraFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'profile-mastra-coverage-'));
  mkdirSync(path.join(dir, 'db'));
  mkdirSync(path.join(dir, 'storage'));
  const powerSyncPath = path.join(dir, 'db/powersync.sqlite');
  const powerSync = new Database(powerSyncPath);
  const mastra = new Database(path.join(dir, 'storage/mastra.db'));
  mastra.exec(`
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
    CREATE TABLE mastra_resources (id TEXT PRIMARY KEY, snapshot TEXT);
    CREATE TABLE mastra_workflow_snapshot (workflow_name TEXT, run_id TEXT, snapshot TEXT);
  `);
  return {
    dir,
    mastra,
    addThread: (id: string, options: { metadata?: string | null; resourceId?: string } = {}) =>
      mastra
        .prepare(
          'INSERT INTO mastra_threads (id, resourceId, title, metadata, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          id,
          options.resourceId ?? 'owner',
          `Thread ${id}`,
          options.metadata ?? null,
          '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.100Z',
        ),
    addMessage: (id: string, threadId: string, content: string, createdAt: string) =>
      mastra
        .prepare(
          'INSERT INTO mastra_messages (id, thread_id, content, role, type, createdAt, resourceId) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(id, threadId, content, 'user', 'text', createdAt, 'owner'),
    inspect: (messages?: ProfileSourceMessageCoverage | null) =>
      readProfileSqliteSnapshot(powerSyncPath, (db) =>
        inspectProfileSource(db, dir, { messages: messages ?? null }),
      ),
    close: () => {
      mastra.close();
      powerSync.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function messageCoverage(
  threadId: string,
  ref: string,
  messages: readonly { id: string; content: string; createdAt: string }[],
): ProfileSourceMessageCoverage {
  const lines: ArchiveMessageLineV1[] = messages.map((message, ordinal) => ({
    k: 'message',
    v: 1,
    ref,
    ordinal,
    sid: message.id,
    role: 'user',
    type: 'text',
    content: message.content,
    createdAt: Date.parse(message.createdAt),
  }));
  const manifest: ArchiveManifest = computeArchiveManifest([
    computeThreadManifestEntry(ref, lines),
  ]);
  return { manifest, refsByThreadId: [{ threadId, ref }] };
}

it('releases a Mastra transcript only when it matches the exported manifest', async () => {
  const f = mastraFixture();
  try {
    f.addThread('thread-1');
    f.addMessage('message-1', 'thread-1', 'hello', '2026-01-01T00:00:01.000Z');
    f.addMessage('message-2', 'thread-1', 'world', '2026-01-01T00:00:02.000Z');
    const coverage = messageCoverage('thread-1', 'ai-conversations:1', [
      { id: 'message-1', content: 'hello', createdAt: '2026-01-01T00:00:01.000Z' },
      { id: 'message-2', content: 'world', createdAt: '2026-01-01T00:00:02.000Z' },
    ]);
    expect((await f.inspect(coverage)).blockers).toEqual([]);
  } finally {
    f.close();
  }
});

it('blocks message count and digest mismatches against the exported manifest', async () => {
  const f = mastraFixture();
  try {
    f.addThread('thread-1');
    f.addMessage('message-1', 'thread-1', 'hello', '2026-01-01T00:00:01.000Z');
    f.addMessage('message-2', 'thread-1', 'world', '2026-01-01T00:00:02.000Z');
    const countMismatch = messageCoverage('thread-1', 'ai-conversations:1', [
      { id: 'message-1', content: 'hello', createdAt: '2026-01-01T00:00:01.000Z' },
    ]);
    expect((await f.inspect(countMismatch)).blockers).toContainEqual(
      expect.objectContaining({ reason: 'storage/mastra.db:messages-uncovered' }),
    );
    const digestMismatch = messageCoverage('thread-1', 'ai-conversations:1', [
      { id: 'message-1', content: 'different', createdAt: '2026-01-01T00:00:01.000Z' },
      { id: 'message-2', content: 'world', createdAt: '2026-01-01T00:00:02.000Z' },
    ]);
    expect((await f.inspect(digestMismatch)).blockers).toContainEqual(
      expect.objectContaining({ reason: 'storage/mastra.db:messages-uncovered' }),
    );
  } finally {
    f.close();
  }
});

it('keeps independent reasons for resources, runtime state and orphan messages', async () => {
  const f = mastraFixture();
  try {
    f.addThread('thread-1');
    f.addMessage('message-1', 'thread-1', 'hello', '2026-01-01T00:00:01.000Z');
    f.mastra.prepare('INSERT INTO mastra_resources (id, snapshot) VALUES (?, ?)').run('r1', '{}');
    f.mastra
      .prepare(
        'INSERT INTO mastra_workflow_snapshot (workflow_name, run_id, snapshot) VALUES (?, ?, ?)',
      )
      .run('workflow', 'run', '{}');
    f.addMessage('orphan', 'missing-thread', 'lost', '2026-01-01T00:00:03.000Z');
    const coverage = messageCoverage('thread-1', 'ai-conversations:1', [
      { id: 'message-1', content: 'hello', createdAt: '2026-01-01T00:00:01.000Z' },
    ]);
    const reasons = (await f.inspect(coverage)).blockers.map((blocker) => blocker.reason);
    expect(reasons).toEqual(
      expect.arrayContaining([
        'storage/mastra.db:resources',
        'storage/mastra.db:unsupported-runtime-state',
        'storage/mastra.db:orphan-thread',
      ]),
    );
  } finally {
    f.close();
  }
});

it('keeps blocking unknown Mastra tables and non-empty thread metadata', async () => {
  const f = mastraFixture();
  try {
    f.addThread('thread-1', { metadata: '{"pinned":true}' });
    f.addMessage('message-1', 'thread-1', 'hello', '2026-01-01T00:00:01.000Z');
    f.mastra.exec(
      "CREATE TABLE mastra_unreviewed_facts (id TEXT PRIMARY KEY); INSERT INTO mastra_unreviewed_facts VALUES ('one')",
    );
    const coverage = messageCoverage('thread-1', 'ai-conversations:1', [
      { id: 'message-1', content: 'hello', createdAt: '2026-01-01T00:00:01.000Z' },
    ]);
    const blockers = (await f.inspect(coverage)).blockers;
    expect(blockers).toContainEqual(
      expect.objectContaining({
        reason: 'storage/mastra.db:messages-uncovered',
        field: 'storage/mastra.db',
      }),
    );
    expect(blockers).toContainEqual(
      expect.objectContaining({ reason: 'unsupported_user_data', field: 'storage/mastra.db' }),
    );
  } finally {
    f.close();
  }
});

it('changes the inventory digest when a message arrives after export', async () => {
  const f = mastraFixture();
  try {
    f.addThread('thread-1');
    f.addMessage('message-1', 'thread-1', 'hello', '2026-01-01T00:00:01.000Z');
    const coverage = messageCoverage('thread-1', 'ai-conversations:1', [
      { id: 'message-1', content: 'hello', createdAt: '2026-01-01T00:00:01.000Z' },
    ]);
    const before = await f.inspect(coverage);
    expect(before.blockers).toEqual([]);
    f.addMessage('message-2', 'thread-1', 'new turn', '2026-01-01T00:00:02.000Z');
    const after = await f.inspect(coverage);
    expect(after.digest).not.toBe(before.digest);
    expect(after.blockers).toContainEqual(
      expect.objectContaining({ reason: 'storage/mastra.db:messages-uncovered' }),
    );
  } finally {
    f.close();
  }
});
