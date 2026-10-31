import { sanitizeConversationTitle } from "@memoflow/ai-contracts";
import { createHash } from "node:crypto";
/**
 * PowerSync CRUD batch executor
 *
 * Receives batched write operations from PowerSync clients and applies
 * them to Postgres via Prisma inside a transaction.
 */

import { createLogger } from "@memoflow/utils/logger";
import { normalizeCrudData } from "./crud-normalization.js";
import { executeUserPreferenceCrudOperation } from "./user-preference-crud-executor.js";
import { executeRelationCrudOperation } from "./relation-crud-executor.js";
import {
  executeRoutineCompoundCrudOperation,
  isRoutineCompoundCrudTable,
} from "./routine-compound-crud-executor.js";
import {
  IDENTITY_ID_TABLES,
  getPrismaDelegate,
  type CrudDelegateContainer,
} from "./table-mapping.js";

const logger = createLogger("PowerSyncCrudExecutor");

export interface CrudTransaction {
  ops?: CrudOperation[];
  crud?: CrudOperation[];
}

export interface CrudOperation {
  op: "PUT" | "PATCH" | "DELETE";
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
  $transaction<T>(
    callback: (tx: CrudDelegateContainer) => Promise<T>,
  ): Promise<T>;
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
 * Apply a batch of CRUD transactions within a single Prisma transaction.
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
      if (operation.type === "routine_preferences") dirtyAllRoutines = true;
      collectRoutineScheduleDirtyOwner(
        operation,
        dirtyRoutineIds,
        dirtyProfileIds,
      );
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

  logger.info("PowerSync CRUD batch received", {
    identityId,
    transactionCount: txCount,
    operationCount: opCount,
  });

  await db.$transaction(async (tx) => {
    for (const transaction of transactions) {
      const ops = transaction.ops || transaction.crud || [];

      for (const op of ops) {
        const { op: opType, type: tableName, id, data } = op;
        if (tableName === "user_preference_records") {
          await executeUserPreferenceCrudOperation(tx, identityId, op);
          continue;
        }
        if (tableName === "relations") {
          await executeRelationCrudOperation(tx as never, identityId, op);
          continue;
        }
        if (isRoutineCompoundCrudTable(tableName)) {
          await executeRoutineCompoundCrudOperation(
            tx as never,
            identityId,
            op,
          );
          continue;
        }
        if (
          tableName === "ai_permission_settings" ||
          tableName === "ai_permission_rules"
        ) {
          const ownerKey = createHash("sha256")
            .update(identityId)
            .digest("hex");
          const validId =
            tableName === "ai_permission_settings"
              ? id === `${ownerKey}:settings`
              : id.startsWith(`${ownerKey}:rule:`);
          if (!validId)
            throw new Error("Permission record id is not owner scoped");
          const model = (
            tableName === "ai_permission_settings"
              ? tx.aiPermissionSetting
              : tx.aiPermissionRule
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
                deleteMany(args: {
                  where: { id: string; identityId: string };
                }): Promise<unknown>;
              }
            | undefined;
          if (!model) throw new Error("Permission storage unavailable");
          const record = normalizeCrudData(tableName, data);
          const ownerRecord = { ...record };
          delete ownerRecord.id;
          delete ownerRecord.identityId;
          if (opType === "PUT") {
            const ownedData = { ...record, id, identityId };
            await model.createMany({ data: ownedData, skipDuplicates: true });
            await model.updateMany({
              where: { id, identityId },
              data: ownedData,
            });
          } else if (opType === "PATCH") {
            await model.updateMany({
              where: { id, identityId },
              data: ownerRecord,
            });
          } else if (opType === "DELETE") {
            await model.deleteMany({ where: { id, identityId } });
          }
          continue;
        }
        if (tableName === "ai_permission_audit") {
          const ownerKey = createHash("sha256")
            .update(identityId)
            .digest("hex");
          if (!id.startsWith(`${ownerKey}:audit:`))
            throw new Error("Permission audit id is not owner scoped");
          const auditDelegate = getPrismaDelegate(tx, tableName);
          if (!auditDelegate)
            throw new Error("Permission audit storage unavailable");
          if (opType === "PUT") {
            await auditDelegate.upsert({
              where: { id },
              create: { ...normalizeCrudData(tableName, data), id, identityId },
              update: {},
            });
            continue;
          }
          if (opType !== "PATCH" || typeof data?.record_json !== "string")
            throw new Error("Permission audit records are append-only");
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
          if (!current) throw new Error("Permission audit record not found");
          const before = JSON.parse(current.recordJson) as Record<
            string,
            unknown
          >;
          const after = JSON.parse(data.record_json) as Record<string, unknown>;
          const immutableBefore = { ...before, execution: "not_started" };
          const immutableAfter = { ...after, execution: "not_started" };
          if (
            before.execution !== "not_started" ||
            !["succeeded", "failed"].includes(String(after.execution)) ||
            JSON.stringify(immutableBefore) !== JSON.stringify(immutableAfter)
          )
            throw new Error("Permission audit execution transition is invalid");
          await auditModel.updateMany({
            where: { id, identityId, recordJson: current.recordJson },
            data: { recordJson: data.record_json },
          });
          continue;
        }
        const delegate = getPrismaDelegate(tx, tableName);

        if (!delegate) {
          logger.warn(`Unknown table in CRUD operation: ${tableName}`);
          continue;
        }

        if (
          tableName === "ai_conversations" &&
          (opType === "PUT" || opType === "PATCH") &&
          data?.name !== undefined
        ) {
          const record = normalizeCrudData(tableName, data);
          const version =
            typeof record.version === "number" &&
            Number.isSafeInteger(record.version) &&
            record.version > 0
              ? record.version
              : 3;
          const name =
            typeof record.name === "string"
              ? sanitizeConversationTitle(record.name)
              : "";
          if (!name) throw new Error("Invalid conversation title");
          if (!delegate.updateMany)
            throw new Error("Conversation conditional update unavailable");
          if (opType === "PUT") {
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
          if (opType === "PATCH" && record.status !== undefined) {
            if (!delegate.findFirst)
              throw new Error("Conversation lookup unavailable");
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
          continue;
        }

        switch (opType) {
          case "PUT": {
            const record: Record<string, unknown> = {
              ...normalizeCrudData(tableName, data),
              id,
            };
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

          case "PATCH": {
            const patchData = normalizeCrudData(tableName, data);
            if (IDENTITY_ID_TABLES.has(tableName)) {
              patchData.identityId = identityId;
            }
            if (
              tableName === "ai_conversations" &&
              patchData.status !== undefined &&
              patchData.name === undefined &&
              patchData.deletedAt === undefined &&
              patchData.updatedAt === undefined
            ) {
              // PowerSync uploads only changed columns. A state-only patch must
              // not let Prisma's @updatedAt reorder history or revive a deletion.
              if (!delegate.findFirst)
                throw new Error("Conversation lookup unavailable");
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

          case "DELETE": {
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

function collectRoutineScheduleDirtyOwner(
  operation: CrudOperation,
  routineIds: Set<string>,
  profileIds: Set<string>,
): void {
  if (operation.type === "routine_definitions") {
    routineIds.add(operation.id);
    return;
  }
  if (operation.type === "routine_profiles") {
    profileIds.add(operation.id);
    return;
  }
  if (
    operation.type !== "routine_profile_memberships" &&
    operation.type !== "routine_temporary_overrides"
  ) {
    return;
  }

  const data = normalizeCrudData(operation.type, operation.data);
  const old = normalizeCrudData(operation.type, operation.old);
  const routineId = old.routineId ?? data.routineId;
  if (typeof routineId === "string" && routineId.trim())
    routineIds.add(routineId);
}
