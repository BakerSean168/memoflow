import { isDeepStrictEqual } from 'node:util';
import type { CrudOperation } from './crud-executor.js';
import { normalizeCrudData } from './crud-normalization.js';
import type { CrudDelegateContainer } from './table-mapping.js';

/**
 * Uplink row-version guard for rows that carry an authoritative `version`
 * aggregate revision (`goals`, `task_plans`).
 *
 * PowerSync uploads only changed columns, and every local domain write already
 * advances `version` by exactly one, so an upload that carries `version` states
 * the revision it was derived from plus one. The server applies the write only
 * when the stored revision is still behind that value; otherwise the upload is
 * stale and must fail loudly instead of overwriting the winning write.
 *
 * See ADR-124 (PowerSync uplink row version guard).
 */
export const ROW_VERSION_GUARDED_TABLES: ReadonlySet<string> = new Set(['goals', 'task_plans']);

export type RowVersionConflictReason = 'stale_version' | 'row_missing';

export class PowerSyncRowVersionConflictError extends Error {
  readonly code = 'row_version_conflict';

  constructor(
    readonly table: string,
    readonly rowId: string,
    readonly operation: 'PUT' | 'PATCH',
    readonly incomingVersion: number | null,
    readonly currentVersion: number | null,
    readonly reason: RowVersionConflictReason,
  ) {
    super(
      `Row version conflict on ${table}/${rowId}: incoming ${
        incomingVersion === null ? 'unversioned' : `v${String(incomingVersion)}`
      }, stored ${currentVersion === null ? 'none' : `v${String(currentVersion)}`}`,
    );
    this.name = 'PowerSyncRowVersionConflictError';
  }
}

interface VersionedRowDelegate {
  createMany(args: {
    data: Record<string, unknown>;
    skipDuplicates: true;
  }): Promise<{ count: number }>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  findFirst(args: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
}

const TABLE_TO_DELEGATE: Readonly<Record<string, string>> = {
  goals: 'goal',
  task_plans: 'taskPlan',
};

function getVersionedDelegate(
  tx: CrudDelegateContainer,
  tableName: string,
): VersionedRowDelegate {
  const modelName = TABLE_TO_DELEGATE[tableName];
  const value = modelName ? tx[modelName] : undefined;
  if (
    !value ||
    typeof value !== 'object' ||
    !('createMany' in value) ||
    typeof value.createMany !== 'function' ||
    !('updateMany' in value) ||
    typeof value.updateMany !== 'function' ||
    !('findFirst' in value) ||
    typeof value.findFirst !== 'function'
  ) {
    throw new Error(`Prisma delegate for version-guarded table ${tableName} is unavailable`);
  }
  return value as VersionedRowDelegate;
}

function requireVersion(value: unknown, tableName: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`Invalid ${tableName} row version in upload: ${String(value)}`);
  }
  return value;
}

/**
 * Normalizes a value for replay comparison: Prisma returns `Date` where the
 * client uploads an ISO string.
 */
function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        comparable(item),
      ]),
    );
  }
  return value;
}

/**
 * A replayed upload (lost 2xx response, at-least-once delivery) already landed.
 * Treat it as success only when every column it carries is already stored.
 */
function isAppliedReplay(
  data: Record<string, unknown>,
  current: Record<string, unknown>,
): boolean {
  return Object.entries(data).every(([key, value]) =>
    isDeepStrictEqual(comparable(value), comparable(current[key])),
  );
}

async function readCurrent(
  delegate: VersionedRowDelegate,
  identityId: string,
  id: string,
): Promise<{ version: number | null; row: Record<string, unknown> } | null> {
  const row = await delegate.findFirst({ where: { id, identityId } });
  if (!row) return null;
  return { version: typeof row.version === 'number' ? row.version : null, row };
}

async function applyCreate(
  delegate: VersionedRowDelegate,
  identityId: string,
  operation: CrudOperation,
  tableName: string,
): Promise<void> {
  const record: Record<string, unknown> = {
    ...normalizeCrudData(tableName, operation.data),
    id: operation.id,
    identityId,
  };
  const version = requireVersion(record.version, tableName);
  // PostgreSQL ON CONFLICT DO NOTHING keeps the enclosing batch transaction
  // healthy; a concurrent create must surface as a conflict, not as P2002.
  const inserted = await delegate.createMany({ data: record, skipDuplicates: true });
  if (inserted.count === 1) return;

  const current = await readCurrent(delegate, identityId, operation.id);
  if (!current) {
    throw new Error(
      `Versioned row ${tableName}/${operation.id} insert was skipped but no stored row exists`,
    );
  }
  if (current.version !== null && current.version < version) {
    const applied = await delegate.updateMany({
      where: { id: operation.id, identityId, version: { lt: version } },
      data: record,
    });
    if (applied.count === 1) return;
    const after = await readCurrent(delegate, identityId, operation.id);
    if (after && isAppliedReplay(record, after.row)) return;
    throw new PowerSyncRowVersionConflictError(
      tableName,
      operation.id,
      'PUT',
      version,
      after?.version ?? null,
      'stale_version',
    );
  }
  if (isAppliedReplay(record, current.row)) return;
  throw new PowerSyncRowVersionConflictError(
    tableName,
    operation.id,
    'PUT',
    version,
    current.version,
    'stale_version',
  );
}

async function applyPatch(
  delegate: VersionedRowDelegate,
  identityId: string,
  operation: CrudOperation,
  tableName: string,
): Promise<void> {
  const patchData = normalizeCrudData(tableName, operation.data);
  if (patchData.version === undefined || patchData.version === null) {
    // Auxiliary column writes (goal status projection, task-plan tombstones)
    // do not advance the aggregate revision; they keep single-column
    // last-write-wins semantics and never touch `version`.
    const applied = await delegate.updateMany({
      where: { id: operation.id, identityId },
      data: patchData,
    });
    if (applied.count === 1) return;
    throw new PowerSyncRowVersionConflictError(
      tableName,
      operation.id,
      'PATCH',
      null,
      null,
      'row_missing',
    );
  }

  const incomingVersion = requireVersion(patchData.version, tableName);
  const applied = await delegate.updateMany({
    where: { id: operation.id, identityId, version: { lt: incomingVersion } },
    data: { ...patchData, identityId },
  });
  if (applied.count === 1) return;

  const current = await readCurrent(delegate, identityId, operation.id);
  if (!current) {
    throw new PowerSyncRowVersionConflictError(
      tableName,
      operation.id,
      'PATCH',
      incomingVersion,
      null,
      'row_missing',
    );
  }
  if (isAppliedReplay(patchData, current.row)) return;
  throw new PowerSyncRowVersionConflictError(
    tableName,
    operation.id,
    'PATCH',
    incomingVersion,
    current.version,
    'stale_version',
  );
}

/**
 * Applies a version-guarded upload without routing it through the generic
 * last-write-wins upsert/update path.
 */
export async function executeRowVersionGuardedCrudOperation(
  tx: CrudDelegateContainer,
  identityId: string,
  operation: CrudOperation,
): Promise<void> {
  if (operation.op !== 'PUT' && operation.op !== 'PATCH') {
    throw new TypeError(
      `Unsupported ${operation.op} on version-guarded table ${operation.type} through PowerSync`,
    );
  }
  const delegate = getVersionedDelegate(tx, operation.type);
  if (operation.op === 'PUT') {
    await applyCreate(delegate, identityId, operation, operation.type);
    return;
  }
  await applyPatch(delegate, identityId, operation, operation.type);
}
