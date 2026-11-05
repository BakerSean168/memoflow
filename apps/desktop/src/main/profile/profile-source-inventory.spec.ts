import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { readProfileSqliteSnapshot } from './profile-sqlite-snapshot';
import { inspectProfileSource } from './profile-source-inventory';

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
      reason: 'unsupported_user_data',
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
