import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { readProfileSqliteSnapshot } from './profile-sqlite-snapshot';

it('reads one consistent SQLite view including WAL and exposes no write path', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'profile-readonly-'));
  const dbPath = path.join(dir, 'source.sqlite');
  const writer = new Database(dbPath);
  try {
    writer.pragma('journal_mode = WAL');
    writer.exec('CREATE TABLE facts (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
    writer.prepare('INSERT INTO facts VALUES (?, ?)').run('one', 'first');
    await readProfileSqliteSnapshot(dbPath, async (db) => {
      expect(
        await db.get<{ value: string }>('SELECT value FROM facts WHERE id = ?', ['one']),
      ).toEqual({ value: 'first' });
      writer.prepare('INSERT INTO facts VALUES (?, ?)').run('two', 'later');
      expect(await db.getAll('SELECT * FROM facts')).toHaveLength(1);
      await expect(db.execute('DELETE FROM facts')).rejects.toThrow('READ_ONLY_SNAPSHOT');
      await expect(db.writeTransaction(async () => undefined)).rejects.toThrow(
        'READ_ONLY_SNAPSHOT',
      );
    });
    await readProfileSqliteSnapshot(dbPath, async (db) => {
      expect(await db.getAll('SELECT * FROM facts')).toHaveLength(2);
    });
    expect(writer.prepare('SELECT COUNT(*) AS count FROM facts').get()).toEqual({ count: 2 });
  } finally {
    writer.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
