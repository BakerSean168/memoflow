import { z } from 'zod';
import type { BusinessOperationReceipt } from './operation-receipt';
import {
  BusinessOperationReceiptSchema,
  buildIdempotencyKeyString,
  parseIdempotencyKeyString,
} from './operation-receipt';
import { IsoDatetimeSchema } from './lease';
import type { ProjectionOperation } from './projection';
import { ProjectionOperationSchema, SourceRevisionSchema } from './projection';

/**
 * ==========================================
 * W0 Module Application Port Contracts
 * 规定各个模块接入 W0 reliable messaging 机制的 Application Port 契约
 *
 * 运行时闭环要求 (P1-2):
 * 1. 所有 port 输入 schema 的幂等三元组 (identityId/source/occurrenceKey) 与 idempotencyKey
 *    均设为 REQUIRED 非空，且 idempotencyKey 必须能够通过 parseIdempotencyKeyString 解析，
 *    并与 (identityId, source, occurrenceKey) 三元组精确对齐。
 * 2. 所有 Application Port 的实现与适配器在返回 BusinessOperationReceipt 或 ProjectionOperation 时，
 *    必须在函数内部/输出边界调用 assertValidBusinessOperationReceipt(receipt) / assertValidProjectionOperation(projection)
 *    （即经 BusinessOperationReceiptSchema.parse() / ProjectionOperationSchema.parse() 校验），
 *    未通过 Schema 校验的输出一律视为非法，不得宣称成功。
 * ==========================================
 */

/**
 * 验证并断言输出必须符合 BusinessOperationReceiptSchema 契约才可宣称成功 (P1-2 闭环)。
 */
export function assertValidBusinessOperationReceipt(receipt: unknown): BusinessOperationReceipt {
  return BusinessOperationReceiptSchema.parse(receipt);
}

/**
 * 验证并断言输出必须符合 ProjectionOperationSchema 契约才可宣称成功 (P1-2 闭环)。
 */
export function assertValidProjectionOperation(projection: unknown): ProjectionOperation {
  return ProjectionOperationSchema.parse(projection);
}

/**
 * 共享 Port 输入幂等键校验逻辑 (P1-2 闭环)。
 */
export function refinePortIdempotencyKey(
  data: { identityId: string; source: string; occurrenceKey: string; idempotencyKey: string },
  ctx: z.RefinementCtx
): void {
  if (!parseIdempotencyKeyString(data.idempotencyKey)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['idempotencyKey'],
      message: `Invalid idempotencyKey format: '${data.idempotencyKey}' cannot be parsed by parseIdempotencyKeyString.`,
    });
    return;
  }
  const expected = buildIdempotencyKeyString({
    identityId: data.identityId,
    source: data.source,
    occurrenceKey: data.occurrenceKey,
  });
  if (data.idempotencyKey !== expected) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['idempotencyKey'],
      message: `Idempotency key mismatch: provided '${data.idempotencyKey}', expected canonical key '${expected}'.`,
    });
  }
}

/** Notification 模块 Application Port */
export const NotificationOutboxDispatchInputSchema = z
  .object({
    operationId: z.string().min(1),
    identityId: z.string().min(1),
    source: z.string().min(1).default('notification'),
    occurrenceKey: z.string().min(1),
    channel: z.string().min(1),
    payloadJson: z.string().min(1),
    idempotencyKey: z.string().min(1),
  })
  .superRefine((data, ctx) => refinePortIdempotencyKey(data, ctx));
export type NotificationOutboxDispatchInput = z.infer<typeof NotificationOutboxDispatchInputSchema>;

export interface NotificationReliableOperationPort {
  /** 写 Dispatch Outbox 事件 (输出必须过 BusinessOperationReceiptSchema.parse) */
  dispatchOutbox(input: NotificationOutboxDispatchInput): Promise<BusinessOperationReceipt>;
  /** 查询指定 identity 的死信队列 (输出必须过 BusinessOperationReceiptSchema.parse) */
  queryDeadLetters(identityId: string): Promise<BusinessOperationReceipt[]>;
  /** 人工/运维 重发死信操作 (输出必须过 BusinessOperationReceiptSchema.parse) */
  replayDeadLetter(params: { identityId: string; operationId: string }): Promise<BusinessOperationReceipt>;
}

/** 3. Account 模块 Application Port */
export const AccountClosureSagaInputSchema = z
  .object({
    identityId: z.string().min(1),
    source: z.string().min(1).default('account'),
    occurrenceKey: z.string().min(1),
    reason: z.string().optional(),
    idempotencyKey: z.string().min(1),
  })
  .superRefine((data, ctx) => refinePortIdempotencyKey(data, ctx));
export type AccountClosureSagaInput = z.infer<typeof AccountClosureSagaInputSchema>;

export interface AccountClosureReliableOperationPort {
  /** 发起账号关闭 Saga 并分配 Operation Receipt (输出必须过 BusinessOperationReceiptSchema.parse) */
  initiateClosureSaga(input: AccountClosureSagaInput): Promise<BusinessOperationReceipt>;
  /** 执行撤销全部 Session 并清理/取消待投递 Work */
  revokeSessionsAndCancelWork(identityId: string): Promise<{
    revokedSessionsCount: number;
    cancelledWorkCount: number;
  }>;
}

/** 4. Goal 模块 Application Port */
export const GoalTaskBindingQueryInputSchema = z.object({
  identityId: z.string().min(1),
  goalId: z.string().min(1),
});
export type GoalTaskBindingQueryInput = z.infer<typeof GoalTaskBindingQueryInputSchema>;

export interface GoalDependencyReadPort {
  /** identity-scoped 查询目标绑定的 Task 数量 */
  checkActiveTaskBindings(input: GoalTaskBindingQueryInput): Promise<{
    hasActiveBindings: boolean;
    activeCount: number;
  }>;
}

export const GoalRecordReceiptInputSchema = z
  .object({
    identityId: z.string().min(1),
    source: z.string().min(1).default('goal'),
    goalId: z.string().min(1),
    occurrenceKey: z.string().min(1),
    idempotencyKey: z.string().min(1),
  })
  .superRefine((data, ctx) => refinePortIdempotencyKey(data, ctx));
export type GoalRecordReceiptInput = z.infer<typeof GoalRecordReceiptInputSchema>;

export interface GoalReliableOperationPort {
  /** 记录目标完成回执 (终态幂等，输出必须过 BusinessOperationReceiptSchema.parse) */
  recordGoalCompletionReceipt(input: GoalRecordReceiptInput): Promise<BusinessOperationReceipt>;
}

/** 5. Task 模块 Application Port */
export interface TaskTransactionRunnerPort {
  /** 强制事务执行器抽象 (模板, 实例, outbox 同一事务提交) */
  executeTransaction<T>(identityId: string, work: () => Promise<T>): Promise<T>;
}

export const TaskRecordOutboxInputSchema = z
  .object({
    identityId: z.string().min(1),
    source: z.string().min(1).default('task'),
    taskId: z.string().min(1),
    occurrenceKey: z.string().min(1),
    goalId: z.string().optional(),
    idempotencyKey: z.string().min(1),
  })
  .superRefine((data, ctx) => refinePortIdempotencyKey(data, ctx));
export type TaskRecordOutboxInput = z.infer<typeof TaskRecordOutboxInputSchema>;

export interface TaskReliableOperationPort {
  /** 记录 Task 完成 Outbox 事件 (输出必须过 BusinessOperationReceiptSchema.parse) */
  recordTaskCompletionOutbox(input: TaskRecordOutboxInput): Promise<BusinessOperationReceipt>;
}

/** 6. Schedule 模块 Application Port */
export const ScheduleConditionalUpdateInputSchema = z
  .object({
    identityId: z.string().min(1),
    source: z.string().min(1).default('schedule'),
    entryId: z.string().min(1),
    occurrenceKey: z.string().min(1),
    expectedVersion: z.number().int().nonnegative(),
    updatePayload: z.unknown(),
    idempotencyKey: z.string().min(1),
  })
  .superRefine((data, ctx) => refinePortIdempotencyKey(data, ctx));
export type ScheduleConditionalUpdateInput = z.infer<typeof ScheduleConditionalUpdateInputSchema>;

export interface ScheduleReliableOperationPort {
  /** 带有 expected version 的 CAS 条件更新 (输出 receipt 必须过 BusinessOperationReceiptSchema.parse) */
  updateCalendarEntryConditional(input: ScheduleConditionalUpdateInput): Promise<{
    success: boolean;
    currentVersion: number;
    receipt: BusinessOperationReceipt;
  }>;
}

export const ScheduleConflictRebuildInputSchema = z
  .object({
    identityId: z.string().min(1),
    source: z.string().min(1).default('schedule'),
    occurrenceKey: z.string().min(1),
    startIso: IsoDatetimeSchema,
    endIso: IsoDatetimeSchema,
    idempotencyKey: z.string().min(1),
  })
  .superRefine((data, ctx) => refinePortIdempotencyKey(data, ctx));
export type ScheduleConflictRebuildInput = z.infer<typeof ScheduleConflictRebuildInputSchema>;

export interface ScheduleConflictRebuildPort {
  /** 事务内入队冲突重算 outbox (输出 projection 必须过 ProjectionOperationSchema.parse) */
  enqueueConflictRebuildOutbox(input: ScheduleConflictRebuildInput): Promise<ProjectionOperation>;
}

/** 7. Repository / Knowledge 模块 Application Port */
export const KnowledgeCommitProjectionInputSchema = z
  .object({
    identityId: z.string().min(1),
    source: z.string().min(1).default('repository'),
    commitSha: SourceRevisionSchema,
    occurrenceKey: z.string().min(1),
    projector: z.string().min(1).default('knowledge-note-projector'),
    files: z.array(z.string()),
    idempotencyKey: z.string().min(1),
  })
  .superRefine((data, ctx) => refinePortIdempotencyKey(data, ctx));
export type KnowledgeCommitProjectionInput = z.infer<typeof KnowledgeCommitProjectionInputSchema>;

export interface KnowledgeProjectionReliablePort {
  /** 将 Git Commit 绑定到本地 Projection Operation (输出 projection 必须过 ProjectionOperationSchema.parse) */
  recordGitCommitProjection(input: KnowledgeCommitProjectionInput): Promise<ProjectionOperation>;
  /** 重用 / 重放指定 Commit 投影 (输出 projection 必须过 ProjectionOperationSchema.parse) */
  replayProjection(params: {
    identityId: string;
    commitSha: string;
    projector: string;
  }): Promise<ProjectionOperation>;
}

/** 8. Cloud Auth 模块 Application Port */
export interface CloudAuthRevocationPort {
  /** 服务端批量撤销 User 全部 active Session */
  revokeAllUserSessions(identityId: string): Promise<{
    revokedCount: number;
    success: boolean;
  }>;
}
