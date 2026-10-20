import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { PowerSyncDatabase } from '@powersync/node';
import { Schema, Table, column } from '@powersync/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopPowerSyncConnector } from '../powersync';
import { recoverPreferenceCanonicalId } from '../powersync-preference-recovery';
import { serializeCrudTransaction } from '../powersync-crud';

vi.mock('../../utils/api-config', () => ({ getApiBaseUrl: () => 'http://test.invalid' }));
const regional = {
  timeZone: 'Asia/Shanghai',
  dateStyle: 'medium',
  timeStyle: '24h',
  weekStartsOn: 1,
};
const edited = { ...regional, timeZone: 'Asia/Tokyo' };
const conflict = (overrides: Record<string, unknown> = {}) => ({
  ok: false,
  code: 409,
  error: {
    code: 'CONFLICT',
    context: {
      code: 'preference_revision_conflict',
      reason: 'canonical_id_mismatch',
      identityId: 'owner',
      namespace: 'regional',
      expectedRevision: 0,
      canonicalId: 'canonical',
      latest: { namespace: 'regional', revision: 1, preferences: regional },
      ...overrides,
    },
  },
});
const schema = new Schema({
  user_preference_records: new Table({
    identity_id: column.text,
    namespace: column.text,
    payload: column.text,
    revision: column.integer,
    created_at: column.text,
    updated_at: column.text,
  }),
  routine_definitions: new Table({ identity_id: column.text, name: column.text }),
});

describe('old preference ID recovery with the real Node SDK queue', () => {
  let root: string;
  let db: PowerSyncDatabase;
  const open = () =>
    new PowerSyncDatabase({
      schema,
      database: {
        dbFilename: `${root}/powersync.sqlite`,
        openWorker: (file, options) => new Worker(file, { ...options, execArgv: [] }),
      },
    });
  const headOps = async () => serializeCrudTransaction((await db.getNextCrudTransaction())!);
  const seed = async () => {
    await db.execute(
      `INSERT INTO user_preference_records
      (id, identity_id, namespace, payload, revision, created_at, updated_at)
      VALUES ('old', 'owner', 'regional', ?, 1, '2026-10-20T00:00:00Z', '2026-10-20T00:00:00Z')`,
      [JSON.stringify(regional)],
    );
    await db.execute(
      `INSERT INTO routine_definitions(id, identity_id, name) VALUES ('routine-1', 'owner', 'offline routine')`,
    );
    await db.execute(
      `UPDATE user_preference_records SET payload = ?, revision = 2 WHERE id = 'old'`,
      [JSON.stringify(edited)],
    );
  };
  beforeEach(async () => {
    root = await mkdtemp(`${tmpdir()}/preference-recovery-567-`);
    db = open();
    await db.waitForReady();
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.close();
    await rm(root, { recursive: true, force: true });
  });

  it('migrates the old head and subsequent offline edits, then uploads all transactions in order', async () => {
    await seed();
    const before = await db.getAll<{ id: number; tx_id: number }>(
      'SELECT id, tx_id FROM ps_crud ORDER BY id',
    );
    const requests: ReturnType<typeof serializeCrudTransaction>[] = [];
    let serverRevision = 1;
    let serverPayload = regional;
    const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
      const ops = JSON.parse(String(init.body)).transactions[0].ops as ReturnType<
        typeof serializeCrudTransaction
      >;
      requests.push(ops);
      if (ops[0]!.id === 'old') {
        expect(await db.getAll('SELECT id, tx_id FROM ps_crud ORDER BY id')).toEqual(before);
        return Response.json(conflict(), { status: 409 });
      }
      // No CRUD was acknowledged by migration, and the offline edit is already
      // visible under the canonical ID before the first successful upload.
      if (requests.length === 2) {
        expect(await db.getAll('SELECT id, tx_id FROM ps_crud ORDER BY id')).toEqual(before);
        const rows = await db.getAll<{ id: string; payload: string; revision: number }>(
          'SELECT id, payload, revision FROM user_preference_records',
        );
        expect(rows).toEqual([{ id: 'canonical', payload: JSON.stringify(edited), revision: 2 }]);
        const journal = await db.get<{ receipt: string }>(
          'SELECT receipt FROM desktop_preference_id_migrations',
        );
        expect(JSON.parse(journal.receipt).queued).toHaveLength(2);
      }
      for (const op of ops) {
        if (op.type === 'user_preference_records') {
          expect(op.id).toBe('canonical');
          if (op.op === 'PATCH') {
            const data = op.data as { payload: string; revision: number };
            expect(data.revision).toBe(serverRevision + 1);
            serverRevision = data.revision;
            serverPayload = JSON.parse(data.payload);
          }
        }
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', fetcher);
    await new DesktopPowerSyncConnector(
      { getAccessToken: async () => 'test' },
      new AbortController().signal,
    ).uploadData(db);
    expect(requests.map((ops) => ops[0]!.id)).toEqual([
      'old',
      'canonical',
      'routine-1',
      'canonical',
    ]);
    expect(serverPayload).toEqual(edited);
    expect(serverRevision).toBe(2);
    expect(await db.getNextCrudTransaction()).toBeNull();
    expect(
      await db.getAll('SELECT row_id FROM ps_updated_rows WHERE row_type = ?', [
        'user_preference_records',
      ]),
    ).toEqual([{ row_id: 'canonical' }]);
  });

  it('persists the migration across restart before retry and never completes a 409', async () => {
    await seed();
    const ops = await headOps();
    expect(await recoverPreferenceCanonicalId(db, ops, conflict())).toBe(true);
    expect((await headOps())[0]!.id).toBe('canonical');
    await db.close();
    db = open();
    await db.waitForReady();
    expect((await headOps())[0]!.id).toBe('canonical');
    expect(await db.getAll('SELECT id FROM ps_crud')).toHaveLength(3);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(conflict({ reason: 'revision_conflict' }), { status: 409 })),
    );
    await expect(
      new DesktopPowerSyncConnector(
        { getAccessToken: async () => 'test' },
        new AbortController().signal,
      ).uploadData(db),
    ).rejects.toThrow(/queued edits retained/);
    expect(await db.getAll('SELECT id FROM ps_crud')).toHaveLength(3);
    // A new upload attempt resumes the already migrated queue, without needing
    // another migration or the old 409 response to survive in memory.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: true })),
    );
    await new DesktopPowerSyncConnector(
      { getAccessToken: async () => 'test' },
      new AbortController().signal,
    ).uploadData(db);
    expect(await db.getNextCrudTransaction()).toBeNull();
    expect(await db.getAll('SELECT id, payload FROM user_preference_records')).toEqual([
      { id: 'canonical', payload: JSON.stringify(edited) },
    ]);
  });

  it.each([
    { identityId: 'foreign' },
    { identityId: undefined },
    { reason: 'revision_conflict' },
    { latest: { namespace: 'regional', revision: 1, preferences: edited } },
    { canonicalId: 'old' },
  ])(
    'keeps all original rows and queue entries when authority proof fails: %j',
    async (overrides) => {
      await seed();
      const before = await db.getAll('SELECT * FROM ps_crud ORDER BY id');
      expect(await recoverPreferenceCanonicalId(db, await headOps(), conflict(overrides))).toBe(
        false,
      );
      expect(await db.getAll('SELECT * FROM ps_crud ORDER BY id')).toEqual(before);
      expect(await db.getAll('SELECT id FROM user_preference_records')).toEqual([{ id: 'old' }]);
    },
  );

  it('rolls back row, queue and receipt together on a mid-migration failure, then retries safely', async () => {
    await seed();
    const before = await db.getAll('SELECT * FROM ps_crud ORDER BY id');
    const originalOps = await headOps();
    const dirty = await db.getAll('SELECT * FROM ps_updated_rows');
    await db.execute(`CREATE TRIGGER fail_preference_migration BEFORE UPDATE OF data ON ps_crud
      BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
    await expect(recoverPreferenceCanonicalId(db, await headOps(), conflict())).rejects.toThrow(
      /injected failure/,
    );
    expect(await db.getAll('SELECT * FROM ps_crud ORDER BY id')).toEqual(before);
    expect(await db.getAll('SELECT * FROM ps_updated_rows')).toEqual(dirty);
    expect(await db.getAll('SELECT id FROM user_preference_records')).toEqual([{ id: 'old' }]);
    expect(
      await db.getAll(
        "SELECT name FROM sqlite_master WHERE name = 'desktop_preference_id_migrations'",
      ),
    ).toEqual([]);
    await db.execute('DROP TRIGGER fail_preference_migration');
    expect(await recoverPreferenceCanonicalId(db, await headOps(), conflict())).toBe(true);
    const migrated = await db.getAll('SELECT * FROM ps_crud ORDER BY id');
    // Replaying stale proof cannot mutate or duplicate the already migrated chain.
    expect(await recoverPreferenceCanonicalId(db, originalOps, conflict())).toBe(false);
    expect(await db.getAll('SELECT * FROM ps_crud ORDER BY id')).toEqual(migrated);
  });

  it('merges an already downloaded canonical row without losing the old-ID edits', async () => {
    await seed();
    await db.execute('INSERT INTO ps_data__user_preference_records(id, data) VALUES (?, ?)', [
      'canonical',
      JSON.stringify({
        identity_id: 'owner',
        namespace: 'regional',
        payload: JSON.stringify(regional),
        revision: 1,
      }),
    ]);
    expect(await recoverPreferenceCanonicalId(db, await headOps(), conflict())).toBe(true);
    expect(await db.getAll('SELECT id, payload, revision FROM user_preference_records')).toEqual([
      { id: 'canonical', payload: JSON.stringify(edited), revision: 2 },
    ]);
  });

  it('preserves mixed-transaction operation boundaries while rewriting only preference IDs', async () => {
    await db.writeTransaction(async (tx) => {
      await tx.execute(
        "INSERT INTO user_preference_records(id, identity_id, namespace, payload, revision) VALUES ('old', 'owner', 'regional', ?, 1)",
        [JSON.stringify(regional)],
      );
      await tx.execute(
        "INSERT INTO routine_definitions(id, identity_id, name) VALUES ('routine-1', 'owner', 'mixed transaction')",
      );
      await tx.execute(
        "UPDATE user_preference_records SET payload = ?, revision = 2 WHERE id = 'old'",
        [JSON.stringify(edited)],
      );
    });
    const before = await headOps();
    expect(before).toHaveLength(3);
    expect(await recoverPreferenceCanonicalId(db, before, conflict())).toBe(true);
    expect(await headOps()).toEqual(
      before.map((op) => (op.type === 'user_preference_records' ? { ...op, id: 'canonical' } : op)),
    );
  });

  it('preflights the entire offline edit chain before mutation', async () => {
    await seed();
    await db.execute(`UPDATE user_preference_records SET revision = 9 WHERE id = 'old'`);
    const before = await db.getAll('SELECT * FROM ps_crud ORDER BY id');
    expect(await recoverPreferenceCanonicalId(db, await headOps(), conflict())).toBe(false);
    expect(await db.getAll('SELECT * FROM ps_crud ORDER BY id')).toEqual(before);
    expect(await db.getAll('SELECT id FROM user_preference_records')).toEqual([{ id: 'old' }]);
  });

  it('does not adopt a foreign-owned canonical ID', async () => {
    await seed();
    await db.execute(
      `INSERT INTO user_preference_records(id, identity_id, namespace, payload, revision)
      VALUES ('canonical', 'foreign', 'regional', ?, 1)`,
      [JSON.stringify(regional)],
    );
    expect(await recoverPreferenceCanonicalId(db, await headOps(), conflict())).toBe(false);
    expect(await db.getAll('SELECT id FROM ps_crud')).toHaveLength(4);
    expect(await db.getAll('SELECT id FROM user_preference_records ORDER BY id')).toEqual([
      { id: 'canonical' },
      { id: 'old' },
    ]);
  });
});
