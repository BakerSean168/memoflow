import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
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
        expect.objectContaining({ field: 'future_owner', reason: 'unsupported_user_data' }),
        expect.objectContaining({ field: 'note.txt', reason: 'unsupported_user_data' }),
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
