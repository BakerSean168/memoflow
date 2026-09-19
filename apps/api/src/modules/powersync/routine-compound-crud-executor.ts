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

export interface RoutineCompoundCrudDatabase {
  readonly routineProfileMembership?: CompoundCrudDelegate;
  readonly routineTemporaryOverride?: CompoundCrudDelegate;
}

export function isRoutineCompoundCrudTable(tableName: string): boolean {
  return tableName === 'routine_profile_memberships' || tableName === 'routine_temporary_overrides';
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

  throw new Error(`Unsupported Routine compound CRUD table: ${operation.type}`);
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
