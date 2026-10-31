import type { CrudOperation } from './crud-executor.js';
import { normalizeCrudData } from './crud-normalization.js';

interface CountResult {
  readonly count: number;
}

interface CompoundCrudDelegate {
  upsert(args: {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<unknown>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<CountResult>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<CountResult>;
}

interface RoutineOccurrenceCrudDelegate {
  findUnique(args: {
    where: { idempotencyKey: string };
    select: { id: true; identityId: true; routineId: true; occurrenceKey: true; status: true };
  }): Promise<{
    id: string;
    identityId: string;
    routineId: string;
    occurrenceKey: string;
    status: string;
  } | null>;
  upsert(args: {
    where: { idempotencyKey: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<unknown>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<CountResult>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<CountResult>;
}

export interface RoutineCompoundCrudDatabase {
  readonly routineProfileMembership?: CompoundCrudDelegate;
  readonly routineTemporaryOverride?: CompoundCrudDelegate;
  readonly routineOccurrence?: RoutineOccurrenceCrudDelegate;
}

export function isRoutineCompoundCrudTable(tableName: string): boolean {
  return (
    tableName === 'routine_profile_memberships' ||
    tableName === 'routine_temporary_overrides' ||
    tableName === 'routine_occurrences'
  );
}

/**
 * Applies Routine tables whose canonical Prisma identity is composite rather than `id`.
 * PowerSync's row id is a local transport identity and must never be used as product identity.
 */
export async function executeRoutineCompoundCrudOperation(
  db: RoutineCompoundCrudDatabase,
  identityId: string,
  operation: CrudOperation,
): Promise<void> {
  if (operation.type === 'routine_profile_memberships') {
    const delegate = db.routineProfileMembership;
    if (!delegate) throw new Error('RoutineProfileMembership Prisma delegate is unavailable');
    await executeMembership(delegate, identityId, operation);
    return;
  }

  if (operation.type === 'routine_temporary_overrides') {
    const delegate = db.routineTemporaryOverride;
    if (!delegate) throw new Error('RoutineTemporaryOverride Prisma delegate is unavailable');
    await executeTemporaryOverride(delegate, identityId, operation);
    return;
  }

  if (operation.type === 'routine_occurrences') {
    const delegate = db.routineOccurrence;
    if (!delegate) throw new Error('RoutineOccurrence Prisma delegate is unavailable');
    await executeOccurrence(delegate, identityId, operation);
    return;
  }

  throw new Error(`Unsupported Routine compound CRUD table: ${operation.type}`);
}

async function executeOccurrence(
  delegate: RoutineOccurrenceCrudDelegate,
  identityId: string,
  operation: CrudOperation,
): Promise<void> {
  const data = normalizeCrudData(operation.type, operation.data);
  const old = normalizeCrudData(operation.type, operation.old);
  const idempotencyKey = requiredString(
    data.idempotencyKey ?? old.idempotencyKey,
    'idempotencyKey',
  );
  assertKeyNotMutated('idempotencyKey', idempotencyKey, data.idempotencyKey);
  const stableWhere = { identityId, idempotencyKey };

  if (operation.op === 'PUT') {
    const existing = await delegate.findUnique({
      where: { idempotencyKey },
      select: { id: true, identityId: true, routineId: true, occurrenceKey: true, status: true },
    });
    if (existing && existing.identityId !== identityId) {
      throw new TypeError('Routine occurrence is unavailable for this identity');
    }
    if (existing && existing.id !== operation.id) {
      assertOccurrenceKeysMatch(existing, data);
    }
    const create = { ...data, id: operation.id, identityId };
    const mutable = withoutKeys(data, [
      'id',
      'identityId',
      'routineId',
      'occurrenceKey',
      'idempotencyKey',
      'createdAt',
    ]);
    if (!existing) {
      await delegate.upsert({ where: { idempotencyKey }, create, update: {} });
    } else if (existing.status === 'running' && isTerminalOccurrenceStatus(data.status)) {
      await delegate.updateMany({ where: { ...stableWhere, status: 'running' }, data: mutable });
    }
    return;
  }

  const existing = await delegate.findUnique({
    where: { idempotencyKey },
    select: { id: true, identityId: true, routineId: true, occurrenceKey: true, status: true },
  });
  if (existing && existing.identityId !== identityId) {
    throw new TypeError('Routine occurrence is unavailable for this identity');
  }
  if (!existing) {
    if (operation.op === 'DELETE') return;
    const mutable = withoutKeys(data, [
      'id',
      'identityId',
      'routineId',
      'occurrenceKey',
      'idempotencyKey',
      'createdAt',
    ]);
    await delegate.updateMany({ where: { id: operation.id, identityId }, data: mutable });
    return;
  }

  if (operation.op === 'DELETE') {
    await delegate.deleteMany({ where: stableWhere });
    return;
  }
  if (existing.id !== operation.id) assertOccurrenceKeysMatch(existing, data);
  if (existing.status !== 'running' && data.status === 'running') return;
  const mutable = withoutKeys(data, [
    'id',
    'identityId',
    'routineId',
    'occurrenceKey',
    'idempotencyKey',
    'createdAt',
  ]);
  await delegate.updateMany({ where: stableWhere, data: mutable });
}

function isTerminalOccurrenceStatus(value: unknown): boolean {
  return value === 'succeeded' || value === 'skipped';
}

function assertOccurrenceKeysMatch(
  existing: { routineId: string; occurrenceKey: string },
  data: Record<string, unknown>,
): void {
  assertKeyNotMutated('routineId', existing.routineId, data.routineId);
  assertKeyNotMutated('occurrenceKey', existing.occurrenceKey, data.occurrenceKey);
}

async function executeMembership(
  delegate: CompoundCrudDelegate,
  identityId: string,
  operation: CrudOperation,
): Promise<void> {
  const data = normalizeCrudData(operation.type, operation.data);
  const old = normalizeCrudData(operation.type, operation.old);

  if (operation.op === 'PUT') {
    const profileId = requiredString(data.profileId, 'profileId');
    const routineId = requiredString(data.routineId, 'routineId');
    const mutable = withoutKeys(data, ['identityId', 'profileId', 'routineId', 'createdAt']);
    await delegate.upsert({
      where: {
        identityId_profileId_routineId: { identityId, profileId, routineId },
      },
      create: { ...data, identityId, profileId, routineId },
      update: mutable,
    });
    return;
  }

  const profileId = requiredString(old.profileId ?? data.profileId, 'profileId');
  const routineId = requiredString(old.routineId ?? data.routineId, 'routineId');
  assertKeyNotMutated('profileId', profileId, data.profileId);
  assertKeyNotMutated('routineId', routineId, data.routineId);
  const where = { identityId, profileId, routineId };

  if (operation.op === 'DELETE') {
    await delegate.deleteMany({ where });
    return;
  }

  const mutable = withoutKeys(data, ['identityId', 'profileId', 'routineId', 'createdAt']);
  const result = await delegate.updateMany({ where, data: mutable });
  if (result.count !== 1) {
    throw new Error('Routine profile membership is unavailable for this identity');
  }
}

async function executeTemporaryOverride(
  delegate: CompoundCrudDelegate,
  identityId: string,
  operation: CrudOperation,
): Promise<void> {
  const data = normalizeCrudData(operation.type, operation.data);
  const old = normalizeCrudData(operation.type, operation.old);

  if (operation.op === 'PUT') {
    const routineId = requiredString(data.routineId, 'routineId');
    const mutable = withoutKeys(data, ['identityId', 'routineId', 'createdAt']);
    await delegate.upsert({
      where: { identityId_routineId: { identityId, routineId } },
      create: { ...data, identityId, routineId },
      update: mutable,
    });
    return;
  }

  const routineId = requiredString(old.routineId ?? data.routineId, 'routineId');
  assertKeyNotMutated('routineId', routineId, data.routineId);
  const where = { identityId, routineId };

  if (operation.op === 'DELETE') {
    await delegate.deleteMany({ where });
    return;
  }

  const mutable = withoutKeys(data, ['identityId', 'routineId', 'createdAt']);
  const result = await delegate.updateMany({ where, data: mutable });
  if (result.count !== 1) {
    throw new Error('Routine temporary override is unavailable for this identity');
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Routine PowerSync CRUD requires ${field}`);
  }
  return value;
}

function assertKeyNotMutated(field: string, current: string, candidate: unknown): void {
  if (candidate !== undefined && candidate !== current) {
    throw new TypeError(`Routine PowerSync CRUD cannot mutate ${field}`);
  }
}

function withoutKeys(
  data: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const result = { ...data };
  for (const key of keys) delete result[key];
  return result;
}
