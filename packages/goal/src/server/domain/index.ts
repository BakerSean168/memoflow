/**
 * Goal Module - Domain Server
 * 目标模块 - 领域服务端
 *
 * 【模块职责】
 * 管理个人 Goal 的 Direction + Measurement 核心业务逻辑。
 *
 * 【包含内容】
 * - 聚合根（Aggregates）：Goal
 * - 实体（Entities）：GoalRecord, GoalReview, KeyResult
 * - 值对象（Value Objects）：从 @memoflow/domain 导出
 * - 仓储接口（Repositories）：IGoalRepository 等
 * - 领域服务（Domain Services）：GoalPolicy, GoalProgressCalculator
 *
 * 【业务特性】
 * - OKR 管理：目标和关键结果的创建、跟踪、评估
 *
 * 【依赖规则】
 * ✅ 允许依赖：
 * - @memoflow/utils（基类：AggregateRoot, Entity）
 * - @memoflow/contracts（DTO 接口、事件 Map）
 * - @memoflow/domain（值对象、枚举）
 *
 * ❌ 禁止依赖：
 * - @memoflow/domain-client（客户端领域模型）
 * - @memoflow/infrastructure-*（基础设施层）
 * - @memoflow/application-*（应用层）
 * - 外部 I/O 库（fs, axios, prisma, ioredis 等）
 */

// 聚合根
export * from './aggregates';

// 实体
export * from './entities';

// 值对象
export * from './value-objects';

// 仓储接口
export {
  GoalLabelOwnershipError,
  GoalVersionConflictError,
} from './repositories/i-goal-repository';

export type {
  IGoalRepository,
  IWeightSnapshotRepository,
  SnapshotQueryResult,
} from './repositories';

// R7 钱包仓储 Port（domain-owned）
export type { IWalletRepository, WalletAccountDTO, WalletTransactionDTO } from './repositories';

// 领域服务（只保留真正的领域服务）
export { GoalPolicy, GoalProgressCalculator, calculateKeyResultProgress } from './services';

// 导出仓储接口类型
export type { IGoalRecordRepository, GoalRecordQueryOptions } from './repositories';
