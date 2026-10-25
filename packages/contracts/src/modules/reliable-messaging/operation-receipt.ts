import { z } from 'zod';
import {
  IsoDatetimeSchema,
  LeaseClaimSchema,
  RELIABLE_MESSAGING_SCHEMA_VERSION,
  SchemaVersionSchema,
  type LeaseClaim,
} from './lease';

/**
 * 统一业务操作与可靠消息状态语义 (W0-1)。
 *
 * - pending: 已建单/入队，等待 worker 领用或到达可执行时间
 * - running: 已由持有有效 lease 的 worker 领用并执行中
 * - succeeded: 业务操作执行成功（终态）
 * - skipped: 满足幂等或前置条件跳过执行（终态）
 * - failed: 不可重试的业务或技术失败（终态）
 * - retryable: 可重试的暂态失败，已记录退避与 nextRetryAt
 * - dead_letter: 达到最大尝试次数或致命异常，入死信队列等待人工/运维 replay
 * - cancelled: 业务主体主动撤销或账号关闭导致的取消（终态）
 */
export const BusinessOperationStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'skipped',
  'failed',
  'retryable',
  'dead_letter',
  'cancelled',
]);

export type BusinessOperationStatus = z.infer<typeof BusinessOperationStatusSchema>;

/** 终态集合 */
export const TERMINAL_OPERATION_STATUSES: readonly BusinessOperationStatus[] = [
  'succeeded',
  'skipped',
  'failed',
  'cancelled',
] as const;

/** 成功终态集合 */
export const SUCCESS_OPERATION_STATUSES: readonly BusinessOperationStatus[] = [
  'succeeded',
  'skipped',
] as const;

/**
 * 投递/执行尝试记录 (DeliveryAttempt)。
 */
export const DeliveryAttemptResultSchema = z.enum(['succeeded', 'failed', 'retryable', 'skipped']);
export type DeliveryAttemptResult = z.infer<typeof DeliveryAttemptResultSchema>;

export const DeliveryAttemptSchema = z.object({
  /** Schema 版本号 (正整数，锁已知版本 P2-5) */
  schemaVersion: SchemaVersionSchema,
  /** 尝试序号（1, 2, 3...） */
  attempt: z.number().int().positive(),
  /** 尝试执行的时间 (ISO timestamp) */
  attemptedAt: IsoDatetimeSchema,
  /** 执行结果 */
  result: DeliveryAttemptResultSchema,
  /** 错误描述；无错误为 null */
  error: z.string().nullable().default(null),
  /** 执行耗时（毫秒） */
  durationMs: z.number().nonnegative().nullable().optional().default(null),
  /** 投递渠道（如 'in-app', 'desktop', 'outbox'）；可选 */
  channel: z.string().nullable().optional().default(null),
});

export type DeliveryAttempt = z.infer<typeof DeliveryAttemptSchema>;

/**
 * 业务操作幂等键 (IdempotencyKey)。
 * 复合键组成: identityId + source + occurrenceKey
 */
export const BusinessOperationIdempotencyKeySchema = z.object({
  /** 操作租户/用户标识 */
  identityId: z.string().min(1),
  /** 业务来源模块（如 'reminder', 'notification', 'goal', 'task', 'schedule', 'repository', 'account'） */
  source: z.string().min(1),
  /** 业务发生点唯一键（如 'templateId:2026-08-09' 或 eventId） */
  occurrenceKey: z.string().min(1),
});

export type BusinessOperationIdempotencyKey = z.infer<typeof BusinessOperationIdempotencyKeySchema>;

/**
 * 生成无碰撞、防歧义的规范化合成幂等键字符串。
 * 采用长度前缀规范化编码: `v1:${len(identityId)}:${identityId}:${len(source)}:${source}:${len(occurrenceKey)}:${occurrenceKey}`
 */
export function buildIdempotencyKeyString(params: BusinessOperationIdempotencyKey): string {
  const { identityId, source, occurrenceKey } = params;
  return `v1:${identityId.length}:${identityId}:${source.length}:${source}:${occurrenceKey.length}:${occurrenceKey}`;
}

/**
 * 解析规范化合成幂等键字符串。
 */
export function parseIdempotencyKeyString(key: string): BusinessOperationIdempotencyKey | null {
  if (typeof key !== 'string' || !key.startsWith('v1:')) return null;
  let rest = key.substring(3);

  const POSITIVE_INT_REGEX = /^[1-9]\d*$/;

  // 1. identityId
  const colon1 = rest.indexOf(':');
  if (colon1 === -1) return null;
  const len1Str = rest.substring(0, colon1);
  if (!POSITIVE_INT_REGEX.test(len1Str)) return null;
  const len1 = Number(len1Str);
  rest = rest.substring(colon1 + 1);
  if (rest.length < len1) return null;
  const identityId = rest.substring(0, len1);
  rest = rest.substring(len1);
  if (!rest.startsWith(':')) return null;
  rest = rest.substring(1);

  // 2. source
  const colon2 = rest.indexOf(':');
  if (colon2 === -1) return null;
  const len2Str = rest.substring(0, colon2);
  if (!POSITIVE_INT_REGEX.test(len2Str)) return null;
  const len2 = Number(len2Str);
  rest = rest.substring(colon2 + 1);
  if (rest.length < len2) return null;
  const source = rest.substring(0, len2);
  rest = rest.substring(len2);
  if (!rest.startsWith(':')) return null;
  rest = rest.substring(1);

  // 3. occurrenceKey
  const colon3 = rest.indexOf(':');
  if (colon3 === -1) return null;
  const len3Str = rest.substring(0, colon3);
  if (!POSITIVE_INT_REGEX.test(len3Str)) return null;
  const len3 = Number(len3Str);
  const occurrenceKey = rest.substring(colon3 + 1);
  if (occurrenceKey.length !== len3) return null;

  const parsed = { identityId, source, occurrenceKey };
  const schemaResult = BusinessOperationIdempotencyKeySchema.safeParse(parsed);
  if (!schemaResult.success) return null;

  if (buildIdempotencyKeyString(schemaResult.data) !== key) return null;

  return schemaResult.data;
}

export type OperationStateRefinementData = {
  status: BusinessOperationStatus;
  lease?: LeaseClaim | null;
  lastError?: string | null;
  nextRetryAt?: string | null;
  deadLetterAt?: string | null;
  finishedAt?: string | null;
};

/**
 * 共享状态不变量校验逻辑 (P1-1 共享模块)。
 * 确保 BusinessOperationReceiptSchema 与 ProjectionOperationSchema 约束完全对齐。
 */
export function refineOperationStateInvariants(
  data: OperationStateRefinementData,
  ctx: z.RefinementCtx,
): void {
  const isTerminal = (TERMINAL_OPERATION_STATUSES as readonly string[]).includes(data.status);
  const isSuccess = (SUCCESS_OPERATION_STATUSES as readonly string[]).includes(data.status);

  // 1. lease 约束 (running 必须有 lease；pending 与 终态 必须清理 lease=null；retryable/dead_letter 允许 lease)
  if (data.status === 'running') {
    if (!data.lease) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lease'],
        message: "Status 'running' MUST carry a valid non-null lease claim.",
      });
    }
  } else if (data.status === 'pending' || isTerminal) {
    if (data.lease !== null && data.lease !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lease'],
        message: `Status '${data.status}' MUST NOT carry a lease claim (must be null).`,
      });
    }
  }

  // 2. nextRetryAt 约束 (仅 retryable 允许并必需)
  if (data.status === 'retryable') {
    if (!data.nextRetryAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nextRetryAt'],
        message: "Status 'retryable' MUST specify a non-null nextRetryAt datetime.",
      });
    }
    if (!data.lastError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lastError'],
        message: "Status 'retryable' MUST specify a non-null lastError description.",
      });
    }
  } else {
    if (data.nextRetryAt !== null && data.nextRetryAt !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nextRetryAt'],
        message: `Status '${data.status}' MUST NOT specify nextRetryAt (must be null).`,
      });
    }
  }

  // 3. deadLetterAt 约束 (仅 dead_letter 允许并必需)
  if (data.status === 'dead_letter') {
    if (!data.deadLetterAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deadLetterAt'],
        message: "Status 'dead_letter' MUST specify a non-null deadLetterAt datetime.",
      });
    }
    if (!data.lastError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lastError'],
        message: "Status 'dead_letter' MUST specify a non-null lastError description.",
      });
    }
  } else {
    if (data.deadLetterAt !== null && data.deadLetterAt !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deadLetterAt'],
        message: `Status '${data.status}' MUST NOT specify deadLetterAt (must be null).`,
      });
    }
  }

  // 4. finishedAt 约束 (终态必须有 finishedAt；非终态必须为 null)
  if (isTerminal) {
    if (!data.finishedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finishedAt'],
        message: `Terminal status '${data.status}' MUST specify a non-null finishedAt datetime.`,
      });
    }
  } else {
    if (data.finishedAt !== null && data.finishedAt !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finishedAt'],
        message: `Non-terminal status '${data.status}' MUST NOT specify finishedAt (expected null).`,
      });
    }
  }

  // 5. lastError 约束 (成功终态不可带 Error)
  if (isSuccess && data.lastError !== null && data.lastError !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lastError'],
      message: `Successful status '${data.status}' MUST NOT carry an error (lastError must be null).`,
    });
  }
}

/** 别名导出：共享状态 refinement 函数 */
export const refineBusinessOperationState = refineOperationStateInvariants;

/**
 * 统一业务操作回执 (BusinessOperationReceipt)。
 * 供 Reminder, Notification, Account Closure, Goal, Task, Schedule, Knowledge 共用。
 */
export const BusinessOperationReceiptSchema = z
  .object({
    /** Schema 版本号 (正整数，锁已知版本 P2-5) */
    schemaVersion: SchemaVersionSchema,
    /** 操作唯一标识 ID */
    operationId: z.string().min(1),
    /** 租户/用户 ID */
    identityId: z.string().min(1),
    /** 业务来源模块 */
    source: z.string().min(1),
    /** 业务发生点唯一键 */
    occurrenceKey: z.string().min(1),
    /** 规范化合成幂等键 string */
    idempotencyKey: z.string().min(1),
    /** 统一状态语义 */
    status: BusinessOperationStatusSchema,
    /** 已尝试执行/投递次数 */
    attempt: z.number().int().nonnegative(),
    /** 领用该操作的分布式租约（未领用或已释放时为 null） */
    lease: LeaseClaimSchema.nullable().default(null),
    /** 最近一次发生的错误描述 */
    lastError: z.string().nullable().default(null),
    /** 下次可重试时间 (ISO timestamp) */
    nextRetryAt: IsoDatetimeSchema.nullable().default(null),
    /** 进入死信状态的时间 (ISO timestamp) */
    deadLetterAt: IsoDatetimeSchema.nullable().default(null),
    /** 因果跟踪: 关联 ID */
    correlationId: z.string().nullable().default(null),
    /** 因果跟踪: 触发本操作的上游操作 ID */
    causationId: z.string().nullable().default(null),
    /** 尝试历史列表 (可选) */
    attemptsHistory: z.array(DeliveryAttemptSchema).optional().default([]),
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

    // 3. 状态不变量校验 (复用共享逻辑)
    refineOperationStateInvariants(data, ctx);
  });

export type BusinessOperationReceipt = z.infer<typeof BusinessOperationReceiptSchema>;
