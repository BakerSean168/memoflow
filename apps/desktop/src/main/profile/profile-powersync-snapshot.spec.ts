import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { PowerSyncDatabase } from '@powersync/node';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';
import { readProfileSqliteSnapshot } from './profile-sqlite-snapshot';
import { inspectProfileSource } from './profile-source-inventory';

it('reads the real PowerSync persisted views after close without loading a second runtime', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'profile-powersync-'));
  await mkdir(path.join(root, 'db'));
  const filename = path.join(root, 'db/powersync.sqlite');
  const db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: filename },
  });
  try {
    await db.init();
    await db.execute(
      'INSERT INTO labels (id, identity_id, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['label-1', 'owner', 'Travel', 'travel', '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z'],
    );
    await db.close();
    await readProfileSqliteSnapshot(filename, async (snapshot) => {
      expect(await snapshot.get('SELECT name FROM labels WHERE id = ?', ['label-1'])).toEqual({
        name: 'Travel',
      });
      const inventory = await inspectProfileSource(snapshot, root);
      expect(inventory.blockers).toEqual([]);
    });
  } finally {
    await db.close();
    await rm(root, { recursive: true, force: true });
  }
});
