import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { PowerSyncDatabase } from '@powersync/node';
import { Schema, Table, column } from '@powersync/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopPowerSyncConnector } from '../powersync';
import { resolveRowVersionConflict } from '../powersync-row-version-conflict';
import { serializeCrudTransaction } from '../powersync-crud';

vi.mock('../../utils/api-config', () => ({ getApiBaseUrl: () => 'http://test.invalid' }));

const conflict = (overrides: Record<string, unknown> = {}) => ({
  ok: false,
  code: 409,
  error: {
    code: 'CONFLICT',
    context: {
      code: 'row_version_conflict',
      reason: 'stale_version',
      identityId: 'owner',
      table: 'goals',
      rowId: 'goal-1',
      operation: 'PATCH',
      incomingVersion: 2,
      currentVersion: 2,
      ...overrides,
    },
  },
});

const schema = new Schema({
  goals: new Table({
    identity_id: column.text,
    name: column.text,
    status: column.text,
    version: column.integer,
    updated_at: column.text,
  }),
  routine_definitions: new Table({ identity_id: column.text, name: column.text }),
});

describe('stale row version resolution with the real Node SDK queue', () => {
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
    // Seeded outside the CRUD queue so the only queued work is the local edit.
    await db.execute(`INSERT INTO ps_data__goals(id, data) VALUES ('goal-1', ?)`, [
      JSON.stringify({
        identity_id: 'owner',
        name: 'Base',
        status: 'Active',
        version: 1,
        updated_at: '2026-11-19T00:00:00.000Z',
      }),
    ]);
    await db.writeTransaction(async (tx) => {
      await tx.execute(
        `UPDATE goals SET name = ?, version = 2, updated_at = ? WHERE id = 'goal-1'`,
        ['Local edit', '2026-11-19T01:00:00.000Z'],
      );
      await tx.execute(
        `INSERT INTO routine_definitions(id, identity_id, name) VALUES ('routine-1', 'owner', 'routine')`,
      );
    });
  };
  beforeEach(async () => {
    root = await mkdtemp(`${tmpdir()}/row-version-conflict-`);
    db = open();
    await db.waitForReady();
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.close();
    await rm(root, { recursive: true, force: true });
  });

  it('drops only the stale row ops, journals the payload and still uploads the rest', async () => {
    await seed();
    const requests: ReturnType<typeof serializeCrudTransaction>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: RequestInit) => {
        const ops = JSON.parse(String(init.body)).transactions[0].ops as ReturnType<
          typeof serializeCrudTransaction
        >;
        requests.push(ops);
        if (ops.some((op) => op.type === 'goals')) {
          expect(ops.map((op) => op.type).sort()).toEqual(['goals', 'routine_definitions']);
          return Response.json(conflict(), { status: 409 });
        }
        expect(ops.map((op) => op.type)).toEqual(['routine_definitions']);
        expect(await db.getAll('SELECT row_id FROM desktop_sync_row_conflicts')).toEqual([
          { row_id: 'goal-1' },
        ]);
        return Response.json({ ok: true });
      }),
    );

    await new DesktopPowerSyncConnector(
      { getAccessToken: async () => 'test' },
      new AbortController().signal,
    ).uploadData(db);

    expect(requests).toHaveLength(2);
    expect(await db.getNextCrudTransaction()).toBeNull();
    const reported = await db.get<{
      table_name: string;
      incoming_version: number;
      current_version: number;
      reason: string;
      payload: string;
    }>(
      'SELECT table_name, incoming_version, current_version, reason, payload FROM desktop_sync_row_conflicts',
    );
    expect(reported).toMatchObject({
      table_name: 'goals',
      incoming_version: 2,
      current_version: 2,
      reason: 'stale_version',
    });
    const payload = JSON.parse(reported.payload) as { ops: { id: string; data: unknown }[] };
    expect(payload.ops).toHaveLength(1);
    expect(payload.ops[0]!.data).toMatchObject({ name: 'Local edit', version: 2 });
  });

  it('drops the whole stale edit chain for the row', async () => {
    await seed();
    await db.execute(`UPDATE goals SET name = ?, version = 3 WHERE id = 'goal-1'`, ['Second edit']);
    const ops = await headOps();
    expect(await resolveRowVersionConflict(db, ops, conflict())).toMatchObject({
      table: 'goals',
      rowId: 'goal-1',
    });
    expect(
      await db.getAll(`SELECT id FROM ps_crud WHERE json_extract(data, '$.type') = 'goals'`),
    ).toEqual([]);
    expect(await db.getAll('SELECT id FROM ps_crud')).toHaveLength(1);
    expect(
      await db.get<{ payload: string }>('SELECT payload FROM desktop_sync_row_conflicts'),
    ).toEqual({ payload: expect.stringContaining('Second edit') });
  });

  it.each([
    { identityId: 'foreign' },
    { rowId: 'goal-2' },
    { incomingVersion: 3 },
    { table: 'task_plans' },
    { reason: 'not_a_reason' },
    { operation: 'DELETE' },
  ])('keeps the queue untouched when the conflict proof fails: %j', async (overrides) => {
    await seed();
    const before = await db.getAll('SELECT * FROM ps_crud ORDER BY id');
    expect(await resolveRowVersionConflict(db, await headOps(), conflict(overrides))).toBeNull();
    expect(await db.getAll('SELECT * FROM ps_crud ORDER BY id')).toEqual(before);
    expect(
      await db.getAll(`SELECT name FROM sqlite_master WHERE name = 'desktop_sync_row_conflicts'`),
    ).toEqual([]);
  });

  it('leaves an unrecognised 409 queued for the connector to retain and retry', async () => {
    await seed();
    const before = await db.getAll('SELECT id FROM ps_crud ORDER BY id');
    expect(
      await resolveRowVersionConflict(db, await headOps(), {
        ok: false,
        code: 409,
        error: { code: 'CONFLICT' },
      }),
    ).toBeNull();
    expect(await db.getAll('SELECT id FROM ps_crud ORDER BY id')).toEqual(before);
  });
});
