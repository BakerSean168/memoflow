import { sanitizeConversationTitle } from '@memoflow/ai-contracts';
import { createHash } from 'node:crypto';
/**
 * PowerSync CRUD batch executor
 *
 * Receives batched write operations from PowerSync clients and applies
 * them to Postgres via Prisma inside a transaction.
 */

import {
  isPermanentDataError,
  isPrismaError,
  isUniqueConstraintError,
} from '@memoflow/utils/errors';
import { createLogger } from '@memoflow/utils/logger';
import { normalizeCrudData } from './crud-normalization.js';
import {
  PowerSyncRowVersionConflictError,
  ROW_VERSION_GUARDED_TABLES,
  executeRowVersionGuardedCrudOperation,
} from './row-version-guard.js';
import {
  PowerSyncPreferenceConflictError,
  executeUserPreferenceCrudOperation,
} from './user-preference-crud-executor.js';
import { executeRelationCrudOperation } from './relation-crud-executor.js';
import {
  executeRoutineCompoundCrudOperation,
  isRoutineCompoundCrudTable,
} from './routine-compound-crud-executor.js';
import {
  IDENTITY_ID_TABLES,
  getPrismaDelegate,
  type CrudDelegate,
  type CrudDelegateContainer,
} from './table-mapping.js';

const logger = createLogger('PowerSyncCrudExecutor');

/**
 * Natural (business) unique keys that exist on tables flowing through the
 * generic PUT upsert. `id` is only the PowerSync row identity: when the server
 * and a client independently create the same logical row they receive different
 * ids, and a raw upsert-by-id collides on the natural key (P2002). See #1125.
 *
 * Keep this list in sync with `@@unique` constraints (excluding those that
 * include `id`) in packages/database/prisma/schema.
 */
const NATURAL_KEY_BY_TABLE: Readonly<Record<string, readonly string[]>> = {
  invocation_attempts: ['invocationId', 'attemptNumber'],
  scheduled_invocations: ['identityId', 'ownerType', 'ownerId', 'schedulingKey'],
  task_occurrences: ['planId', 'occurrenceKey'],
  goal_records: ['identityId', 'sourceType', 'sourceId'],
  notifications: ['identityId', 'idempotencyKey'],
  notification_interactions: ['identityId', 'idempotencyKey'],
  notification_preferences: ['identityId'],
  routine_preferences: ['identityId'],
  routine_interactions: ['identityId', 'idempotencyKey'],
};

function buildPutRecord(
  tableName: string,
  identityId: string,
  operation: CrudOperation,
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    ...normalizeCrudData(tableName, operation.data),
    id: operation.id,
  };
  if (IDENTITY_ID_TABLES.has(tableName)) {
    record.identityId = identityId;
  }
  return record;
}

function buildNaturalKeyWhere(
  tableName: string,
  record: Record<string, unknown>,
): Record<string, unknown> | null {
  const fields = NATURAL_KEY_BY_TABLE[tableName];
  if (!fields) return null;
  const where: Record<string, unknown> = {};
  // Tenant scope always participates in the lookup, even when the database
  // constraint does not include identityId. A conflicting row owned by another
  // identity must never be updated by this upload.
  if (typeof record.identityId === 'string') where.identityId = record.identityId;
  for (const field of fields) {
    const value = record[field];
    // A nullable component (e.g. goal_records.sourceType) cannot participate
    // in Postgres uniqueness; there is no conflict to resolve.
    if (value === undefined || value === null) return null;
    where[field] = value;
  }
  return where;
}

/**
 * Converges an upload onto the row that already owns its natural key.
 *
 * The existing row keeps its id (the natural key is authoritative business
 * identity), and the uploaded columns are applied to it with the same
 * last-write-wins semantics as the generic PUT path. We prefer merging over
 * skipping: a duplicate id must not discard a user edit (for example a locally
 * completed task occurrence), and replaying the same PUT is idempotent because
 * it always targets the same surviving row.
 */
async function mergeIntoNaturalKeyRow(
  delegate: CrudDelegate,
  tableName: string,
  uploadedId: string,
  record: Record<string, unknown>,
): Promise<boolean> {
  const where = buildNaturalKeyWhere(tableName, record);
  const lookup = delegate as unknown as {
    findFirst?: (args: {
      where: Record<string, unknown>;
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
  if (!where || typeof lookup.findFirst !== 'function') return false;

  const existing = await lookup.findFirst({ where, select: { id: true } });
  if (!existing || existing.id === uploadedId) return false;

  const data = { ...record };
  delete data.id;
  await delegate.update({ where: { id: existing.id }, data });
  logger.warn('PowerSync CRUD natural-key conflict merged into existing row', {
    table: tableName,
    uploadedId,
    canonicalId: existing.id,
    naturalKey: where,
  });
  return true;
}

/**
 * A poisoned operation is a permanently invalid client row (constraint or
 * validation failure). Only these are isolated per operation so one bad row
 * cannot block the rest of the upload batch (#1125). Connection/pool/
 * transaction failures stay fatal: the client must retry the whole batch.
 * The Prisma code vocabulary lives in the shared error mapper (ADR-049).
 */
function isPoisonOperationError(error: unknown): boolean {
  // ADR-125 conflicts and preference CAS conflicts are deliberate signals that
  // must reach the client as 409; they are never silenced by batch isolation.
  if (error instanceof PowerSyncRowVersionConflictError) return false;
  if (error instanceof PowerSyncPreferenceConflictError) return false;
  return isPermanentDataError(error);
}

export interface CrudTransaction {
  ops?: CrudOperation[];
  crud?: CrudOperation[];
}

export interface CrudOperation {
  op: 'PUT' | 'PATCH' | 'DELETE';
  type: string;
  id: string;
  data?: Record<string, unknown>;
  old?: Record<string, unknown>;
}

export interface CrudBatchResult {
  transactionCount: number;
  operationCount: number;
}

interface CrudTransactionDatabase {
  $transaction<T>(callback: (tx: CrudDelegateContainer) => Promise<T>): Promise<T>;
  routineProfileMembership?: {
    findMany(args: {
      where: { identityId: string; profileId: { in: string[] } };
      select: { routineId: true };
    }): Promise<Array<{ routineId: string }>>;
  };
  routineDefinition?: {
    findMany(args: {
      where: { identityId: string };
      select: { id: true };
    }): Promise<Array<{ id: string }>>;
  };
}

export interface CrudBatchHooks {
  readonly onRoutineScheduleChanged?: (input: {
    readonly identityId: string;
    readonly routineId: string;
  }) => void | Promise<void>;
}

/**
 * Apply a batch of CRUD transactions. The batch commits atomically unless a
 * permanently bad row is detected; that row is then isolated so the remaining
 * operations still land (#1125). The `onRoutineScheduleChanged` hooks fire
 * after the write phase.
 */
export async function executeCrudBatch(
  db: CrudTransactionDatabase,
  identityId: string,
  transactions: CrudTransaction[],
  hooks: CrudBatchHooks = {},
): Promise<CrudBatchResult> {
  const txCount = transactions.length;
  const opCount = transactions.reduce(
    (count, tx) => count + (tx.ops?.length ?? tx.crud?.length ?? 0),
    0,
  );

  const dirtyRoutineIds = new Set<string>();
  const dirtyProfileIds = new Set<string>();
  let dirtyAllRoutines = false;

  for (const transaction of transactions) {
    for (const operation of transaction.ops || transaction.crud || []) {
      if (operation.type === 'routine_preferences') dirtyAllRoutines = true;
      collectRoutineScheduleDirtyOwner(operation, dirtyRoutineIds, dirtyProfileIds);
    }
  }

  // Resolve existing Profile -> Routine edges before mutation. This preserves
  // dirty-owner knowledge even when a profile DELETE cascades its memberships.
  if (dirtyProfileIds.size > 0 && db.routineProfileMembership) {
    const rows = await db.routineProfileMembership.findMany({
      where: { identityId, profileId: { in: [...dirtyProfileIds] } },
      select: { routineId: true },
    });
    for (const row of rows) dirtyRoutineIds.add(row.routineId);
  }

  logger.info('PowerSync CRUD batch received', {
    identityId,
    transactionCount: txCount,
    operationCount: opCount,
  });

  const executeCrudOperation = async (
    tx: CrudDelegateContainer,
    op: CrudOperation,
  ): Promise<void> => {
    const { op: opType, type: tableName, id, data } = op;
    if (tableName === 'user_preference_records') {
      await executeUserPreferenceCrudOperation(tx, identityId, op);
      return;
    }
    if (tableName === 'relations') {
      await executeRelationCrudOperation(tx as never, identityId, op);
      return;
    }
    if (isRoutineCompoundCrudTable(tableName)) {
      await executeRoutineCompoundCrudOperation(tx as never, identityId, op);
      return;
    }
    if (tableName === 'ai_permission_settings' || tableName === 'ai_permission_rules') {
      const ownerKey = createHash('sha256').update(identityId).digest('hex');
      const validId =
        tableName === 'ai_permission_settings'
          ? id === `${ownerKey}:settings`
          : id.startsWith(`${ownerKey}:rule:`);
      if (!validId) throw new Error('Permission record id is not owner scoped');
      const model = (
        tableName === 'ai_permission_settings' ? tx.aiPermissionSetting : tx.aiPermissionRule
      ) as
        | {
            createMany(args: {
              data: Record<string, unknown>;
              skipDuplicates: true;
            }): Promise<unknown>;
            updateMany(args: {
              where: { id: string; identityId: string };
              data: Record<string, unknown>;
            }): Promise<unknown>;
            deleteMany(args: { where: { id: string; identityId: string } }): Promise<unknown>;
          }
        | undefined;
      if (!model) throw new Error('Permission storage unavailable');
      const record = normalizeCrudData(tableName, data);
      const ownerRecord = { ...record };
      delete ownerRecord.id;
      delete ownerRecord.identityId;
      if (opType === 'PUT') {
        const ownedData = { ...record, id, identityId };
        await model.createMany({ data: ownedData, skipDuplicates: true });
        await model.updateMany({
          where: { id, identityId },
          data: ownedData,
        });
      } else if (opType === 'PATCH') {
        await model.updateMany({
          where: { id, identityId },
          data: ownerRecord,
        });
      } else if (opType === 'DELETE') {
        await model.deleteMany({ where: { id, identityId } });
      }
      return;
    }
    if (tableName === 'ai_permission_audit') {
      const ownerKey = createHash('sha256').update(identityId).digest('hex');
      if (!id.startsWith(`${ownerKey}:audit:`))
        throw new Error('Permission audit id is not owner scoped');
      const auditDelegate = getPrismaDelegate(tx, tableName);
      if (!auditDelegate) throw new Error('Permission audit storage unavailable');
      if (opType === 'PUT') {
        await auditDelegate.upsert({
          where: { id },
          create: { ...normalizeCrudData(tableName, data), id, identityId },
          update: {},
        });
        return;
      }
      if (opType !== 'PATCH' || typeof data?.record_json !== 'string')
        throw new Error('Permission audit records are append-only');
      const auditModel = tx.aiPermissionAudit as {
        findFirst(args: {
          where: { id: string; identityId: string };
          select: { recordJson: true };
        }): Promise<{ recordJson: string } | null>;
        updateMany(args: {
          where: { id: string; identityId: string; recordJson: string };
          data: { recordJson: string };
        }): Promise<unknown>;
      };
      const current = await auditModel.findFirst({
        where: { id, identityId },
        select: { recordJson: true },
      });
      if (!current) throw new Error('Permission audit record not found');
      const before = JSON.parse(current.recordJson) as Record<string, unknown>;
      const after = JSON.parse(data.record_json) as Record<string, unknown>;
      const immutableBefore = { ...before, execution: 'not_started' };
      const immutableAfter = { ...after, execution: 'not_started' };
      if (
        before.execution !== 'not_started' ||
        !['succeeded', 'failed'].includes(String(after.execution)) ||
        JSON.stringify(immutableBefore) !== JSON.stringify(immutableAfter)
      )
        throw new Error('Permission audit execution transition is invalid');
      await auditModel.updateMany({
        where: { id, identityId, recordJson: current.recordJson },
        data: { recordJson: data.record_json },
      });
      return;
    }
    const delegate = getPrismaDelegate(tx, tableName);

    if (!delegate) {
      logger.warn(`Unknown table in CRUD operation: ${tableName}`);
      return;
    }

    if (ROW_VERSION_GUARDED_TABLES.has(tableName) && (opType === 'PUT' || opType === 'PATCH')) {
      // ADR-125: a stale cloud/local double write must fail loudly instead
      // of overwriting the winning aggregate revision.
      await executeRowVersionGuardedCrudOperation(tx, identityId, op);
      return;
    }

    if (
      tableName === 'ai_conversations' &&
      (opType === 'PUT' || opType === 'PATCH') &&
      data?.name !== undefined
    ) {
      const record = normalizeCrudData(tableName, data);
      const version =
        typeof record.version === 'number' &&
        Number.isSafeInteger(record.version) &&
        record.version > 0
          ? record.version
          : 3;
      const name = typeof record.name === 'string' ? sanitizeConversationTitle(record.name) : '';
      if (!name) throw new Error('Invalid conversation title');
      if (!delegate.updateMany) throw new Error('Conversation conditional update unavailable');
      if (opType === 'PUT') {
        // Create once; a replay must never replace a newer title or resurrect a tombstone.
        await delegate.upsert({
          where: { id },
          create: { ...record, id, identityId, name, version },
          update: {},
        });
      }
      // Title patches are independent of status/activity and only advance the authoritative revision.
      await delegate.updateMany({
        where: {
          id,
          identityId,
          deletedAt: null,
          version: { lt: version },
        },
        data: {
          name,
          version,
          ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
        },
      });
      if (opType === 'PATCH' && record.status !== undefined) {
        if (!delegate.findFirst) throw new Error('Conversation lookup unavailable');
        const current = await delegate.findFirst({
          where: { id, identityId, deletedAt: null },
          select: { updatedAt: true },
        });
        if (current)
          await delegate.update({
            where: { id, identityId, deletedAt: null },
            data: { status: record.status, updatedAt: current.updatedAt },
          });
      }
      return;
    }

    switch (opType) {
      case 'PUT': {
        const record = buildPutRecord(tableName, identityId, op);
        if (await mergeIntoNaturalKeyRow(delegate, tableName, id, record)) break;
        await delegate.upsert({
          where: { id },
          create: record,
          update: record,
        });
        break;
      }

      case 'PATCH': {
        const patchData = normalizeCrudData(tableName, data);
        if (IDENTITY_ID_TABLES.has(tableName)) {
          patchData.identityId = identityId;
        }
        if (
          tableName === 'ai_conversations' &&
          patchData.status !== undefined &&
          patchData.name === undefined &&
          patchData.deletedAt === undefined &&
          patchData.updatedAt === undefined
        ) {
          // PowerSync uploads only changed columns. A state-only patch must
          // not let Prisma's @updatedAt reorder history or revive a deletion.
          if (!delegate.findFirst) throw new Error('Conversation lookup unavailable');
          const current = await delegate.findFirst({
            where: { id, identityId, deletedAt: null },
            select: { updatedAt: true },
          });
          if (!current) break;
          await delegate.update({
            where: { id, identityId, deletedAt: null },
            data: { ...patchData, updatedAt: current.updatedAt },
          });
          break;
        }
        await delegate.update({
          where: { id },
          data: patchData,
        });
        break;
      }

      case 'DELETE': {
        await delegate.deleteMany({
          where: { id },
        });
        break;
      }

      default:
        logger.warn(`Unknown CRUD operation type: ${opType}`);
    }
  };

  const operations = transactions.flatMap(
    (transaction) => transaction.ops || transaction.crud || [],
  );
  await executeBatchAtomically(db, identityId, operations, executeCrudOperation);

  if (dirtyAllRoutines && db.routineDefinition) {
    const rows = await db.routineDefinition.findMany({
      where: { identityId },
      select: { id: true },
    });
    for (const row of rows) dirtyRoutineIds.add(row.id);
  }

  if (hooks.onRoutineScheduleChanged) {
    for (const routineId of [...dirtyRoutineIds].sort()) {
      await hooks.onRoutineScheduleChanged({ identityId, routineId });
    }
  }

  return { transactionCount: txCount, operationCount: opCount };
}

type OperationExecutor = (tx: CrudDelegateContainer, operation: CrudOperation) => Promise<void>;

/**
 * Applies the whole upload in one transaction first, so a deliberate conflict
 * (ADR-125 row version, preference revision/canonical CAS) or a transient
 * infrastructure failure rolls back every sibling operation and reaches the
 * client as a single 409/5xx. Only when the batch fails because of a
 * permanently invalid row do we replay each operation in its own transaction,
 * isolating the poison row so the rest of the batch still lands (#1125).
 */
async function executeBatchAtomically(
  db: CrudTransactionDatabase,
  identityId: string,
  operations: CrudOperation[],
  execute: OperationExecutor,
): Promise<void> {
  if (operations.length === 0) return;
  try {
    await db.$transaction(async (tx) => {
      for (const operation of operations) await execute(tx, operation);
    });
    return;
  } catch (error) {
    // Conflicts and transient faults fail the batch as a unit; nothing was
    // committed, so there is no partial upload to reconcile.
    if (!isPoisonOperationError(error)) throw error;
  }
  for (const operation of operations) {
    await executeCrudOperationWithIsolation(db, identityId, operation, execute);
  }
}

/**
 * Applies one upload operation in its own transaction so that a poisoned row
 * (a permanent constraint/validation failure) cannot roll back the rest of the
 * batch. Transient failures and deliberate ADR-125 conflicts still fail the
 * batch so the client retries or surfaces a 409.
 */
async function executeCrudOperationWithIsolation(
  db: CrudTransactionDatabase,
  identityId: string,
  operation: CrudOperation,
  execute: OperationExecutor,
): Promise<void> {
  try {
    await db.$transaction((tx) => execute(tx, operation));
    return;
  } catch (error) {
    // The pre-flight natural-key lookup can still race a concurrent insert.
    // The failed transaction is aborted, so resolve the conflict in a fresh one.
    if (isUniqueConstraintError(error)) {
      const merged = await retryNaturalKeyMerge(db, identityId, operation);
      if (merged) return;
    }
    if (!isPoisonOperationError(error)) throw error;

    const prismaError = isPrismaError(error) ? error : null;
    logger.warn('PowerSync CRUD poison operation isolated', {
      identityId,
      table: operation.type,
      op: operation.op,
      rowId: operation.id,
      errorCode: prismaError?.code ?? 'unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorMeta: prismaError?.meta,
    });
  }
}

async function retryNaturalKeyMerge(
  db: CrudTransactionDatabase,
  identityId: string,
  operation: CrudOperation,
): Promise<boolean> {
  if (operation.op !== 'PUT' || !NATURAL_KEY_BY_TABLE[operation.type]) return false;
  const record = buildPutRecord(operation.type, identityId, operation);
  try {
    return await db.$transaction(async (tx) => {
      const delegate = getPrismaDelegate(tx, operation.type);
      if (!delegate) return false;
      return mergeIntoNaturalKeyRow(delegate, operation.type, operation.id, record);
    });
  } catch (error) {
    // A transient failure while retrying must still reach the client.
    if (!isPoisonOperationError(error)) throw error;
    logger.warn('PowerSync CRUD natural-key merge retry failed', {
      identityId,
      table: operation.type,
      op: operation.op,
      rowId: operation.id,
      errorCode: isPrismaError(error) ? error.code : 'unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function collectRoutineScheduleDirtyOwner(
  operation: CrudOperation,
  routineIds: Set<string>,
  profileIds: Set<string>,
): void {
  if (operation.type === 'routine_definitions') {
    routineIds.add(operation.id);
    return;
  }
  if (operation.type === 'routine_profiles') {
    profileIds.add(operation.id);
    return;
  }
  if (
    operation.type !== 'routine_profile_memberships' &&
    operation.type !== 'routine_temporary_overrides'
  ) {
    return;
  }

  const data = normalizeCrudData(operation.type, operation.data);
  const old = normalizeCrudData(operation.type, operation.old);
  const routineId = old.routineId ?? data.routineId;
  if (typeof routineId === 'string' && routineId.trim()) routineIds.add(routineId);
}
