import {
  OperationAuditActionSchema,
  OperationAuditRecordSchema,
  OperationAuditQuerySchema,
  type OperationAuditAction,
  type OperationAuditQuery,
  type OperationAuditRecord,
  type OperationSource,
} from '@memoflow/operations-contracts';

export type {
  OperationAuditAction,
  OperationAuditQuery,
  OperationAuditRecord,
  OperationSource,
} from '@memoflow/operations-contracts';

export interface OperationAuditRecordInput {
  actorIdentityId: string;
  source: OperationSource;
  operationId: string;
  action: OperationAuditAction;
  details?: string | null;
}

export interface OperationAuditRepository {
  /**
   * 记录一次 query/replay 审计 (输出必须过 OperationAuditRecordSchema.parse)。
   * P1-4：可选的 `tx` 事务客户端用于把审计事实与 operation 状态推进放进同一事务；
   * 传入 tx 时实现必须在该事务内写入，未传入时使用自身持久化连接。
   */
  record(input: OperationAuditRecordInput, tx?: unknown): Promise<OperationAuditRecord>;
  /** 按 actor 查询审计记录 (最小权限: 只能看自己的) */
  listByActor(query: {
    identityId: string;
    source?: string;
    operationId?: string;
    limit?: number;
  }): Promise<OperationAuditRecord[]>;
}

function parseRecord(raw: unknown): OperationAuditRecord {
  return OperationAuditRecordSchema.parse(raw);
}

export function assertValidOperationAuditRecord(record: unknown): OperationAuditRecord {
  return parseRecord(record);
}

export function parseOperationAuditAction(action: string): OperationAuditAction {
  return OperationAuditActionSchema.parse(action);
}

export function parseOperationAuditQuery(query: unknown): OperationAuditQuery {
  return OperationAuditQuerySchema.parse(query);
}

/**
 * P1-3: timeline_query 审计的 operationId 占位标记。
 *
 * query 审计是对集合的访问，不是对单个 operation 的访问；把 operationId
 * 固定为 `*timeline-query*` 并随 details 记录 source/过滤条件/结果计数，
 * 避免把任意 operationId 伪造成被访问事实。
 */
export const TIMELINE_QUERY_OPERATION_MARKER = '*timeline-query*';

export interface TimelineQueryAuditInput {
  actorIdentityId: string;
  source: OperationSource;
  filters?: Readonly<Record<string, unknown>>;
  resultCount: number;
}

/**
 * 记录一次 `timeline_query` 审计（fail-closed 由调用方保证：record 抛错即查询失败）。
 */
export function buildTimelineQueryAuditRecordInput(
  input: TimelineQueryAuditInput,
): OperationAuditRecordInput {
  return {
    actorIdentityId: input.actorIdentityId,
    source: input.source,
    operationId: TIMELINE_QUERY_OPERATION_MARKER,
    action: 'timeline_query',
    details: JSON.stringify({
      filters: input.filters ?? {},
      resultCount: input.resultCount,
    }),
  };
}

/**
 * 执行 timeline 查询并记录 query 审计；审计写入失败时查询整体失败（fail-closed）。
 * 返回 `{ entries, auditRecord }`。
 */
export async function runTimelineQueryWithAudit<T>(input: {
  repository: OperationAuditRepository;
  source: OperationSource;
  actorIdentityId: string;
  filters?: Readonly<Record<string, unknown>>;
  query: () => Promise<T[]>;
}): Promise<{ entries: T[]; auditRecord: OperationAuditRecord }> {
  const entries = await input.query();
  const auditRecord = await input.repository.record(
    buildTimelineQueryAuditRecordInput({
      actorIdentityId: input.actorIdentityId,
      source: input.source,
      filters: input.filters,
      resultCount: entries.length,
    }),
  );
  return { entries, auditRecord };
}
