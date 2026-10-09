import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import { readProfileSqliteSnapshot } from './profile-sqlite-snapshot';
import { composeProfilePortability } from './compose-profile-portability';

it('exports all ten owners from a real read-only SQLite transaction without starting runtimes', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'profile-owners-'));
  const filename = path.join(dir, 'source.sqlite');
  const writer = new Database(filename);
  try {
    for (const [name, table] of Object.entries(PowerSyncAppSchema.props)) {
      writer.exec(
        `CREATE TABLE "${name}" (id TEXT PRIMARY KEY, ${table.columns.map((column) => `"${column.name}" ${column.type}`).join(', ')})`,
      );
    }
    writer
      .prepare(
        'INSERT INTO accounts (id, status, profile, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        'IdentityId_source',
        'Active',
        JSON.stringify({
          nickname: 'Local',
          realName: null,
          avatarUrl: null,
          bio: null,
          gender: 'PreferNotToSay',
          birthday: null,
        }),
        '2026-10-09T00:00:00.000Z',
        '2026-10-09T00:00:00.000Z',
      );
    const result = await readProfileSqliteSnapshot(filename, (db) =>
      composeProfilePortability(db, '2026-10-09T00:00:00.000Z').export('IdentityId_source'),
    );
    // Absent notification delivery preferences intentionally export null.
    expect(result.capabilityKeys).toHaveLength(9);
    expect(
      result.envelope.capabilities.find((entry) => entry.key === 'account-profile')?.payload,
    ).toMatchObject({ nickname: 'Local' });
  } finally {
    writer.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
