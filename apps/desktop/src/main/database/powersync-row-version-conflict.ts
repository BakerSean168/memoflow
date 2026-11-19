import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { isDeepStrictEqual } from 'node:util';
import type { SerializedCrudOperation } from './powersync-crud';

/**
 * Resolution for the server's ADR-124 row-version conflict (409
 * `row_version_conflict`) on `goals` / `task_plans` uplink.
 *
 * The server rejected every queued op for the row because the stored revision
 * is already ahead of the local base. Retrying can never succeed, so this drops
 * the stale queued ops (never the transaction's other rows), journals the
 * rejected payloads durably, and lets the pending download bring the winning
 * server revision into the local view.
 */
const GUARDED_TABLES: ReadonlySet<string> = new Set(['goals', 'task_plans']);

export interface RowVersionConflict {
  readonly table: string;
  readonly rowId: string;
  readonly identityId: string;
  readonly operation: 'PUT' | 'PATCH';
  readonly incomingVersion: number | null;
  readonly currentVersion: number | null;
  readonly reason: 'stale_version' | 'row_missing';
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function versionOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function readConflict(body: unknown): RowVersionConflict | null {
  if (!record(body) || body.ok !== false || body.code !== 409 || !record(body.error)) return null;
  if (body.error.code !== 'CONFLICT') return null;
  const context = body.error.context;
  if (!record(context) || context.code !== 'row_version_conflict') return null;
  const { table, rowId, identityId, operation, incomingVersion, currentVersion, reason } = context;
  if (typeof table !== 'string' || !GUARDED_TABLES.has(table)) return null;
  if (typeof rowId !== 'string' || !rowId) return null;
  if (typeof identityId !== 'string' || !identityId) return null;
  if (operation !== 'PUT' && operation !== 'PATCH') return null;
  if (reason !== 'stale_version' && reason !== 'row_missing') return null;
  const incoming = incomingVersion === null ? null : versionOf(incomingVersion);
  const current = currentVersion === null ? null : versionOf(currentVersion);
  if (incomingVersion !== null && incoming === null) return null;
  if (currentVersion !== null && current === null) return null;
  return { table, rowId, identityId, operation, incomingVersion: incoming, currentVersion: current, reason };
}

interface QueueRow {
  id: number;
  tx_id: number | null;
  data: string;
}

interface LocalRow {
  id: string;
  data: string;
}

function queuedData(row: QueueRow): Record<string, unknown> | null {
  const value: unknown = JSON.parse(row.data);
  return record(value) ? value : null;
}

/**
 * Validates the whole queued edit chain for the conflicted row before any
 * mutation: every queued op must be that row's versioned upload, versions must
 * be strictly increasing from the rejected one, and the local row must hold the
 * last queued version.
 */
function isStaleChain(
  rows: QueueRow[],
  conflict: RowVersionConflict,
  localData: Record<string, unknown>,
): boolean {
  if (rows.length === 0) return false;
  // Unversioned auxiliary column writes (no aggregate revision) carry nothing
  // to order; they are resolved only when the whole queued chain is unversioned.
  if (conflict.incomingVersion === null) {
    return rows.every((row) => {
      const entry = queuedData(row);
      return (
        entry !== null &&
        entry.type === conflict.table &&
        entry.id === conflict.rowId &&
        (entry.op === 'PUT' || entry.op === 'PATCH') &&
        record(entry.data) &&
        entry.data.version === undefined
      );
    });
  }
  let previous = conflict.incomingVersion;
  for (const [index, row] of rows.entries()) {
    const entry = queuedData(row);
    if (
      !entry ||
      entry.type !== conflict.table ||
      entry.id !== conflict.rowId ||
      (entry.op !== 'PUT' && entry.op !== 'PATCH') ||
      !record(entry.data)
    ) {
      return false;
    }
    const version = versionOf(entry.data.version);
    if (version === null) return false;
    if (index === 0 ? version !== previous : version <= previous) return false;
    previous = version;
  }
  return versionOf(localData.version) === previous;
}

/**
 * Returns the resolved conflict, or `null` when the response is not an
 * authorised row-version conflict for the queued batch. A `null` result leaves
 * the queue untouched so the connector keeps the existing retry behaviour.
 */
export async function resolveRowVersionConflict(
  database: Pick<AbstractPowerSyncDatabase, 'writeTransaction'>,
  ops: SerializedCrudOperation[],
  body: unknown,
): Promise<RowVersionConflict | null> {
  const conflict = readConflict(body);
  if (!conflict) return null;
  const headOp = ops.find(
    (op) =>
      op.type === conflict.table &&
      op.id === conflict.rowId &&
      (op.op === 'PUT' || op.op === 'PATCH') &&
      (conflict.incomingVersion === null ||
        versionOf(record(op.data) ? op.data.version : undefined) === conflict.incomingVersion),
  );
  if (!headOp || !Number.isSafeInteger(headOp.op_id)) return null;

  const resolved = await database.writeTransaction(async (tx) => {
    const head = await tx.getOptional<QueueRow>('SELECT id, tx_id, data FROM ps_crud WHERE id = ?', [
      headOp.op_id,
    ]);
    if (!head || head.tx_id !== (headOp.tx_id ?? null)) return false;
    const original = queuedData(head);
    if (
      !original ||
      original.id !== conflict.rowId ||
      original.type !== conflict.table ||
      !isDeepStrictEqual(original.data, headOp.data)
    ) {
      return false;
    }

    const local = await tx.getOptional<LocalRow>(
      `SELECT id, data FROM ps_data__${conflict.table} WHERE id = ?`,
      [conflict.rowId],
    );
    if (!local) return false;
    const localData: unknown = JSON.parse(local.data);
    if (!record(localData) || localData.identity_id !== conflict.identityId) return false;

    const queued = await tx.getAll<QueueRow>(
      `SELECT id, tx_id, data FROM ps_crud
       WHERE json_extract(data, '$.type') = ? AND json_extract(data, '$.id') = ?
       ORDER BY id`,
      [conflict.table, conflict.rowId],
    );
    if (queued.length === 0 || queued[0]!.id !== head.id) return false;
    if (!isStaleChain(queued, conflict, localData)) return false;

    await tx.execute(`CREATE TABLE IF NOT EXISTS desktop_sync_row_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      incoming_version INTEGER,
      current_version INTEGER,
      reason TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    await tx.execute(
      `INSERT INTO desktop_sync_row_conflicts
        (identity_id, table_name, row_id, incoming_version, current_version, reason, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conflict.identityId,
        conflict.table,
        conflict.rowId,
        conflict.incomingVersion,
        conflict.currentVersion,
        conflict.reason,
        JSON.stringify({ ops: queued.map((row) => JSON.parse(row.data) as unknown) }),
        new Date().toISOString(),
      ],
    );
    await tx.execute(
      `DELETE FROM ps_crud WHERE json_extract(data, '$.type') = ? AND json_extract(data, '$.id') = ?`,
      [conflict.table, conflict.rowId],
    );
    return true;
  });
  return resolved ? conflict : null;
}
