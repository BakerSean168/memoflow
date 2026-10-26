import { z } from 'zod';
import type { BusinessOperationReceipt } from './operation-receipt';
import {
  BusinessOperationStatusSchema,
  BusinessOperationReceiptSchema,
  buildIdempotencyKeyString,
  refineOperationStateInvariants,
} from './operation-receipt';
import {
  IsoDatetimeSchema,
  LeaseClaimSchema,
  RELIABLE_MESSAGING_SCHEMA_VERSION,
  SchemaVersionSchema,
} from './lease';

const GIT_SHA_OR_UUID_REGEX =
  /^(?:[0-9a-fA-F]{7,40}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

/**
 * 投影源 Revision Schema (P2-2)。
 * 仅接受非负整数 (版本号) 或有效 Hex Git commit SHA (7-40字符) / UUID 格式字符串。
 * 严禁 NaN、负数、空字符串或非法格式。
 */
export const SourceRevisionSchema = z.union([
  z.number().int().nonnegative(),
  z.string().refine((s) => GIT_SHA_OR_UUID_REGEX.test(s), {
    message: 'sourceRevision string must be a valid Git commit SHA (7-40 hex chars) or UUID string',
  }),
]);

export type SourceRevision = z.infer<typeof SourceRevisionSchema>;

/**
 * 派生/异步投影操作状态契约 (ProjectionOperation)。
 * 具备与 BusinessOperationReceipt 闭环的完整语义（operationId、idempotencyKey、lease、nextRetryAt、deadLetterAt 等）。
 * 适用于 Schedule 派生冲突表重算、Knowledge 外部 Git commit 本地投影、Goal/Task Read model 等。
 */
export const ProjectionOperationSchema = z
  .object({
    /** Schema 版本号 (正整数，锁已知版本 P2-5) */
    schemaVersion: SchemaVersionSchema,
    /** 投影操作唯一 ID */
    operationId: z.string().min(1),
    /** 租户/用户 ID */
    identityId: z.string().min(1),
    /** 业务来源 (如 'schedule', 'repository') */
    source: z.string().min(1).default('projection'),
    /** 业务发生点唯一键 */
    occurrenceKey: z.string().min(1),
    /** 规范化合成幂等键 string */
    idempotencyKey: z.string().min(1),
    /** 投影器名称 (如 'schedule-conflict-builder', 'knowledge-note-projector') */
    projector: z.string().min(1),
    /** 源聚合/版本 Revision (支持版本号或 Git commit SHA/UUID) */
    sourceRevision: SourceRevisionSchema,
    /** 投影状态 */
    status: BusinessOperationStatusSchema,
    /** 是否具备由源真值全量/增量可重放 (replayable) 能力 */
    replayable: z.boolean().default(true),
    /** 已尝试次数 */
    attempt: z.number().int().nonnegative().default(0),
    /** 领用该投影的分布式租约 */
    lease: LeaseClaimSchema.nullable().default(null),
    /** 上一次处理到的游标 ID (如源 Outbox Message ID 或 Resource ID) */
    lastProcessedId: z.string().nullable().default(null),
    /** 上一次成功投影时间 (ISO timestamp) */
    lastProcessedAt: IsoDatetimeSchema.nullable().default(null),
    /** 投影发生的最近一次错误 */
    lastError: z.string().nullable().default(null),
    /** 下次可重试时间 (ISO timestamp) */
    nextRetryAt: IsoDatetimeSchema.nullable().default(null),
    /** 进入死信状态的时间 (ISO timestamp) */
    deadLetterAt: IsoDatetimeSchema.nullable().default(null),
    /** 因果跟踪: 关联 ID */
    correlationId: z.string().nullable().default(null),
    /** 因果跟踪: 触发本操作的上游操作 ID */
    causationId: z.string().nullable().default(null),
    /** 创建时间 (ISO timestamp) */
    createdAt: IsoDatetimeSchema,
    /** 更新时间 (ISO timestamp) */
    updatedAt: IsoDatetimeSchema,
    /** 终态完成时间 (ISO timestamp) */
    finishedAt: IsoDatetimeSchema.nullable().default(null),
  })
  .superRefine((data, ctx) => {
    // 1. Schema 版本控制校验
    if (data.schemaVersion > RELIABLE_MESSAGING_SCHEMA_VERSION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schemaVersion'],
        message: `Unknown or unsupported schemaVersion: ${data.schemaVersion}. Max supported is ${RELIABLE_MESSAGING_SCHEMA_VERSION}.`,
      });
    }

    // 2. 幂等键一致性校验
    const expectedKey = buildIdempotencyKeyString({
      identityId: data.identityId,
      source: data.source,
      occurrenceKey: data.occurrenceKey,
    });
    if (data.idempotencyKey !== expectedKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['idempotencyKey'],
        message: `Idempotency key mismatch: provided '${data.idempotencyKey}', expected canonical key '${expectedKey}'.`,
      });
    }

    // 3. 状态不变量校验 (P1-1 共享通用逻辑，保证与 BusinessOperationReceiptSchema 100% 一致)
    refineOperationStateInvariants(data, ctx);
  });

export type ProjectionOperation = z.infer<typeof ProjectionOperationSchema>;

/**
 * 将 ProjectionOperation 转换为通用 BusinessOperationReceipt。
 * 运行时强制对转换后的对象执行 BusinessOperationReceiptSchema.parse()，确保返回的一定是合法 Receipt。
 */
export function projectionOperationToReceipt(
  projection: ProjectionOperation,
): BusinessOperationReceipt {
  const rawReceipt = {
    schemaVersion: projection.schemaVersion,
    operationId: projection.operationId,
    identityId: projection.identityId,
    source: projection.source,
    occurrenceKey: projection.occurrenceKey,
    idempotencyKey: projection.idempotencyKey,
    status: projection.status,
    attempt: projection.attempt,
    lease: projection.lease,
    lastError: projection.lastError,
    nextRetryAt: projection.nextRetryAt,
    deadLetterAt: projection.deadLetterAt,
    correlationId: projection.correlationId,
    causationId: projection.causationId,
    attemptsHistory: [],
    createdAt: projection.createdAt,
    updatedAt: projection.updatedAt,
    finishedAt: projection.finishedAt,
  };
  return BusinessOperationReceiptSchema.parse(rawReceipt);
}

/**
 * 投影重放 (Replay) 契约请求 Schema
 */
export const ProjectionReplayRequestSchema = z.object({
  /** 租户/用户 ID */
  identityId: z.string().min(1),
  /** 目标投影器名称 */
  projector: z.string().min(1),
  /** 目标投影操作 ID (可选) */
  operationId: z.string().optional(),
  /** 重载起点 Revision (可选) */
  fromRevision: SourceRevisionSchema.optional(),
  /** 是否强制全量重建 (force rebuild) */
  forceRebuild: z.boolean().default(false),
  /** 重载触发原因 */
  reason: z.string().min(1),
});

export type ProjectionReplayRequest = z.infer<typeof ProjectionReplayRequestSchema>;

/**
 * 投影授权查询 Filter Schema
 */
export const ProjectionQueryFilterSchema = z.object({
  identityId: z.string().min(1),
  projector: z.string().optional(),
  status: BusinessOperationStatusSchema.optional(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0),
});

export type ProjectionQueryFilter = z.infer<typeof ProjectionQueryFilterSchema>;
