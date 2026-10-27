import type { PreferenceNamespace, PreferenceNamespaceResponse } from '@memoflow/setting-contracts';
import {
  parsePreferenceNamespace,
  parsePreferenceNamespacePayload,
} from '@memoflow/setting-contracts';
import { isDeepStrictEqual } from 'node:util';
import { normalizeCrudData } from './crud-normalization.js';
import type { CrudDelegateContainer } from './table-mapping.js';

interface UserPreferenceRow {
  id: string;
  identityId: string;
  namespace: string;
  payload: unknown;
  revision: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface UserPreferenceCrudDelegate {
  findUnique(args: { where: Record<string, unknown> }): Promise<UserPreferenceRow | null>;
  createMany(args: {
    data: Record<string, unknown>;
    skipDuplicates: true;
  }): Promise<{ count: number }>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
}

export interface UserPreferenceCrudOperation {
  op: 'PUT' | 'PATCH' | 'DELETE';
  id: string;
  data?: Record<string, unknown>;
}

export class PowerSyncPreferenceConflictError extends Error {
  readonly code = 'preference_revision_conflict';

  constructor(
    readonly namespace: PreferenceNamespace,
    readonly expectedRevision: number,
    readonly latest: PreferenceNamespaceResponse,
    readonly canonicalId?: string,
    readonly reason: 'revision_conflict' | 'canonical_id_mismatch' = 'revision_conflict',
  ) {
    super(
      `Preference revision conflict for ${namespace}: expected ${String(expectedRevision)}, latest ${String(latest.revision)}`,
    );
    this.name = 'PowerSyncPreferenceConflictError';
  }
}

function getPreferenceDelegate(tx: CrudDelegateContainer): UserPreferenceCrudDelegate {
  const value = tx.userPreferenceRecord;
  if (
    !value ||
    typeof value !== 'object' ||
    !('findUnique' in value) ||
    typeof value.findUnique !== 'function' ||
    !('createMany' in value) ||
    typeof value.createMany !== 'function' ||
    !('updateMany' in value) ||
    typeof value.updateMany !== 'function'
  ) {
    throw new Error('Prisma userPreferenceRecord delegate is unavailable');
  }
  return value as UserPreferenceCrudDelegate;
}

function requireRevision(value: unknown, minimum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new TypeError(`Invalid preference revision: ${String(value)}`);
  }
  return value as number;
}

function requirePayload(namespace: PreferenceNamespace, value: unknown): Record<string, unknown> {
  if (value === undefined) {
    throw new TypeError('Preference sync write requires a full namespace payload');
  }
  return parsePreferenceNamespacePayload(namespace, value) as Record<string, unknown>;
}

function toResponse(row: UserPreferenceRow): PreferenceNamespaceResponse {
  const namespace = parsePreferenceNamespace(row.namespace);
  return {
    namespace,
    preferences: parsePreferenceNamespacePayload(namespace, row.payload),
    revision: requireRevision(row.revision, 1),
  } as PreferenceNamespaceResponse;
}

async function readNamespaceWinner(
  delegate: UserPreferenceCrudDelegate,
  identityId: string,
  namespace: PreferenceNamespace,
): Promise<UserPreferenceRow | null> {
  return delegate.findUnique({
    where: { identityId_namespace: { identityId, namespace } },
  });
}

async function throwConflict(
  delegate: UserPreferenceCrudDelegate,
  identityId: string,
  namespace: PreferenceNamespace,
  expectedRevision: number,
  latestHint?: UserPreferenceRow | null,
): Promise<never> {
  const latest = latestHint ?? (await readNamespaceWinner(delegate, identityId, namespace));
  if (!latest) {
    throw new Error(
      `Preference CAS failed but no canonical row exists for ${identityId}/${namespace}`,
    );
  }
  throw new PowerSyncPreferenceConflictError(
    namespace,
    expectedRevision,
    toResponse(latest),
    latest.id,
  );
}

async function executeCreate(
  delegate: UserPreferenceCrudDelegate,
  identityId: string,
  operation: UserPreferenceCrudOperation,
): Promise<void> {
  const normalized = normalizeCrudData('user_preference_records', operation.data);
  const namespace = parsePreferenceNamespace(String(normalized.namespace ?? ''));
  const revision = requireRevision(normalized.revision, 1);
  if (revision !== 1) {
    throw new TypeError(`New preference rows must start at revision 1, got ${String(revision)}`);
  }
  const payload = requirePayload(namespace, normalized.payload);

  // PostgreSQL ON CONFLICT DO NOTHING keeps the enclosing batch transaction
  // healthy, including concurrent inserts. Never catch P2002 and query that tx.
  const inserted = await delegate.createMany({
    skipDuplicates: true,
    data: {
      id: operation.id,
      identityId,
      namespace,
      payload,
      revision,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
    },
  });
  if (inserted.count === 1) return;

  const latest = await readNamespaceWinner(delegate, identityId, namespace);
  if (latest) {
    const identical =
      latest.revision === revision && isDeepStrictEqual(toResponse(latest).preferences, payload);
    if (identical && latest.id === operation.id) return;
    // Old clients complete uploads on any 2xx. A different ID must remain an
    // explicit conflict until a client can durably reconcile its optimistic row.
    throw new PowerSyncPreferenceConflictError(
      namespace,
      0,
      toResponse(latest),
      latest.id,
      identical ? 'canonical_id_mismatch' : 'revision_conflict',
    );
  }
  throw new Error(
    'Preference insert skipped but no canonical row exists for this identity/namespace',
  );
}

async function executePatch(
  delegate: UserPreferenceCrudDelegate,
  identityId: string,
  operation: UserPreferenceCrudOperation,
): Promise<void> {
  const current = await delegate.findUnique({ where: { id: operation.id } });
  if (!current || current.identityId !== identityId) {
    throw new Error(`Preference row ${operation.id} is unavailable for this identity`);
  }

  const namespace = parsePreferenceNamespace(current.namespace);
  const normalized = normalizeCrudData('user_preference_records', operation.data);
  if (normalized.namespace !== undefined && normalized.namespace !== namespace) {
    throw new TypeError('Preference namespace is immutable');
  }

  const incomingRevision = requireRevision(normalized.revision, 2);
  const expectedRevision = incomingRevision - 1;
  if (current.revision !== expectedRevision) {
    throw new PowerSyncPreferenceConflictError(
      namespace,
      expectedRevision,
      toResponse(current),
      current.id,
    );
  }
  const payload = requirePayload(namespace, normalized.payload);

  const updated = await delegate.updateMany({
    where: {
      id: operation.id,
      identityId,
      revision: expectedRevision,
    },
    data: {
      payload,
      revision: incomingRevision,
      updatedAt: normalized.updatedAt,
    },
  });
  if (updated.count === 1) return;
  if (updated.count > 1) {
    throw new Error(
      `Preference sync CAS updated ${String(updated.count)} rows for unique id ${operation.id}`,
    );
  }

  const latest = await delegate.findUnique({ where: { id: operation.id } });
  await throwConflict(delegate, identityId, namespace, expectedRevision, latest);
}

/**
 * Applies PowerSync uploads for canonical preference rows without routing them
 * through the generic last-write-wins upsert/update path.
 */
export async function executeUserPreferenceCrudOperation(
  tx: CrudDelegateContainer,
  identityId: string,
  operation: UserPreferenceCrudOperation,
): Promise<void> {
  const delegate = getPreferenceDelegate(tx);
  if (operation.op === 'PUT') {
    await executeCreate(delegate, identityId, operation);
    return;
  }
  if (operation.op === 'PATCH') {
    await executePatch(delegate, identityId, operation);
    return;
  }
  throw new TypeError('Deleting canonical preference rows through PowerSync is unsupported');
}
