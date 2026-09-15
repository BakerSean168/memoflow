/**
 * PowerSync CRUD batch executor
 *
 * Receives batched write operations from PowerSync clients and applies
 * them to Postgres via Prisma inside a transaction.
 */

import { createLogger } from '@memoflow/utils/logger';
import { normalizeCrudData } from './crud-normalization.js';
import { executeUserPreferenceCrudOperation } from './user-preference-crud-executor.js';
import { executeRelationCrudOperation } from './relation-crud-executor.js';
import {
  IDENTITY_ID_TABLES,
  getPrismaDelegate,
  type CrudDelegateContainer,
} from './table-mapping.js';

const logger = createLogger('PowerSyncCrudExecutor');

export interface CrudTransaction {
  ops?: CrudOperation[];
  crud?: CrudOperation[];
}

export interface CrudOperation {
  op: 'PUT' | 'PATCH' | 'DELETE';
  type: string;
  id: string;
  data?: Record<string, unknown>;
}

export interface CrudBatchResult {
  transactionCount: number;
  operationCount: number;
}

interface CrudTransactionDatabase {
  $transaction<T>(callback: (tx: CrudDelegateContainer) => Promise<T>): Promise<T>;
}

/**
 * Apply a batch of CRUD transactions within a single Prisma transaction.
 */
export async function executeCrudBatch(
  db: CrudTransactionDatabase,
  identityId: string,
  transactions: CrudTransaction[],
): Promise<CrudBatchResult> {
  const txCount = transactions.length;
  const opCount = transactions.reduce(
    (count, tx) => count + (tx.ops?.length ?? tx.crud?.length ?? 0),
    0,
  );

  logger.info('PowerSync CRUD batch received', {
    identityId,
    transactionCount: txCount,
    operationCount: opCount,
  });

  await db.$transaction(async (tx) => {
    for (const transaction of transactions) {
      const ops = transaction.ops || transaction.crud || [];

      for (const op of ops) {
        const { op: opType, type: tableName, id, data } = op;
        if (tableName === 'user_preference_records') {
          await executeUserPreferenceCrudOperation(tx, identityId, op);
          continue;
        }
        if (tableName === 'relations') {
          await executeRelationCrudOperation(tx as never, identityId, op);
          continue;
        }
        const delegate = getPrismaDelegate(tx, tableName);

        if (!delegate) {
          logger.warn(`Unknown table in CRUD operation: ${tableName}`);
          continue;
        }

        switch (opType) {
          case 'PUT': {
            const record: Record<string, unknown> = { ...normalizeCrudData(tableName, data), id };
            if (IDENTITY_ID_TABLES.has(tableName)) {
              record.identityId = identityId;
            }
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
      }
    }
  });

  return { transactionCount: txCount, operationCount: opCount };
}
