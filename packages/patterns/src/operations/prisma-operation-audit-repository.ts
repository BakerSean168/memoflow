import {
  assertValidOperationAuditRecord,
  type OperationAuditRecord,
  type OperationAuditRecordInput,
  type OperationAuditRepository,
} from './operation-audit-repository';

interface OperationAuditLogRow {
  id: string;
  actorIdentityId: string;
  source: string;
  operationId: string;
  action: string;
  details: string | null;
  createdAt: Date;
}

/**
 * 审计仓库所需的 PrismaClient 最小结构面（shared 层不依赖 infra 包）。
 */
export interface OperationAuditPrismaClient {
  operationAuditLog: {
    create(data: { data: unknown }): Promise<OperationAuditLogRow>;
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: Record<string, 'asc' | 'desc'>;
      take?: number;
    }): Promise<OperationAuditLogRow[]>;
  };
}

/**
 * 把 OperationAuditRecordInput 转换为 Prisma create data。
 * 供各模块 replay 原子事务内直接写 `operationAuditLog`（P1-4）。
 */
export function buildOperationAuditLogCreateData(input: OperationAuditRecordInput): {
  actorIdentityId: string;
  source: string;
  operationId: string;
  action: string;
  details: string | null;
} {
  return {
    actorIdentityId: input.actorIdentityId,
    source: input.source,
    operationId: input.operationId,
    action: input.action,
    details: input.details ?? null,
  };
}

/**
 * 判定一个审计写入目标是否为 Prisma 事务/客户端（具有 `operationAuditLog` 模型）。
 */
function hasOperationAuditLogModel(
  candidate: unknown,
): candidate is { operationAuditLog: { create(data: { data: unknown }): Promise<unknown> } } {
  return typeof candidate === 'object' && candidate !== null && 'operationAuditLog' in candidate;
}

/**
 * Prisma 实现的共享审计仓库 (W7 A)。
 *
 * 所有模块的 timeline query / replay 入口都通过同一张
 * `reliable_operation_audit_logs` 表落库，保证审计事实单一来源。
 */
export class PrismaOperationAuditRepository implements OperationAuditRepository {
  constructor(private readonly prisma: OperationAuditPrismaClient) {}

  async record(input: OperationAuditRecordInput, tx?: unknown): Promise<OperationAuditRecord> {
    const db = hasOperationAuditLogModel(tx) ? tx : this.prisma;
    const row = await db.operationAuditLog.create({
      data: buildOperationAuditLogCreateData(input),
    });
    return assertValidOperationAuditRecord(
      toAuditRecord(row as Parameters<typeof toAuditRecord>[0]),
    );
  }

  async listByActor(query: {
    identityId: string;
    source?: string;
    operationId?: string;
    limit?: number;
  }): Promise<OperationAuditRecord[]> {
    const rows = await this.prisma.operationAuditLog.findMany({
      where: {
        actorIdentityId: query.identityId,
        ...(query.source ? { source: query.source } : {}),
        ...(query.operationId ? { operationId: query.operationId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 50,
    });
    return rows.map((row) => assertValidOperationAuditRecord(toAuditRecord(row)));
  }
}

function toAuditRecord(row: {
  id: string;
  actorIdentityId: string;
  source: string;
  operationId: string;
  action: string;
  details: string | null;
  createdAt: Date;
}): OperationAuditRecord {
  return {
    id: row.id,
    actorIdentityId: row.actorIdentityId,
    source: row.source as OperationAuditRecord['source'],
    operationId: row.operationId,
    action: row.action as OperationAuditRecord['action'],
    details: row.details,
    createdAt: row.createdAt.toISOString(),
  };
}
