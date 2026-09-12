/**
 * Convenience factories for Prisma-backed goal runtime composition.
 * 目标模块 Prisma 运行时组合便捷工厂。
 */

import type { UserTimeContextPort } from '@memoflow/time';
import type { PrismaClient } from '@memoflow/database';
import {
  createGoalModule,
  type GoalModuleInstance,
  type GoalRuntimeContributionsInput,
} from './goal.module';
import {
  GoalPrismaRepository,
  GoalRecordPrismaRepository,
  PrismaGoalWriteTransactionRunner,
  PrismaGoalDeletionTransactionRunner,
  type PrismaGoalRelationCleanupFactory,
  WalletPrismaRepository,
} from './adapters/prisma';
import { PrismaHabitRepository } from './adapters/prisma/prisma-habit.repository';
import { createGoalScheduleProjectionSource } from './schedule-projection-source';
import {
  createGoalReminderFireHandler,
  type GoalReminderFirePayload,
} from './goal-reminder-fire.handler';
import type { NotificationRequestedWriterPort } from '@memoflow/contracts/notification';
import type { ScheduledHandlerRegistration } from '@memoflow/contracts/schedule';
import type { GoalScheduleProjectionSource } from '../../schedule-projection';
import { createGoalTaskProgressHandler } from '../application/event-handlers';
import type { GoalDependencyReadPort } from '@memoflow/contracts/reliable-messaging';
import type { IGoalRecordRepository, IGoalRepository, IWalletRepository } from '../domain';
import type { IHabitRepository } from '../application/use-cases/commands/habit.use-cases';
import type { GoalWriteTransactionRunner } from '../application/use-cases/commands/goal-write-support';

/**
 * Host-facing goal repository set.
 * 面向宿主暴露的目标仓储集合。
 *
 * Represents the repository Ports that persistence adapters must satisfy.
 * Concrete adapter classes never cross this seam — hosts consume repositories
 * only through these interfaces.
 *
 * 表示持久化适配器必须满足的仓储 Port。
 * 具体适配器类从不越过该 seam——宿主只能通过这些接口使用仓储。
 *
 * `habitRepository` is optional because PowerSync has no habit adapter;
 * only the Prisma lane supplies it.
 * `habitRepository` 是可选的，因为 PowerSync 没有习惯适配器；仅 Prisma 一条线提供它。
 *
 * `walletRepository` remains optional because PowerSync has no Wallet adapter.
 */
export interface GoalRepositorySet {
  readonly goalRepository: IGoalRepository;
  readonly goalRecordRepository: IGoalRecordRepository;
  readonly goalWriteTransactionRunner: GoalWriteTransactionRunner;
  readonly habitRepository?: IHabitRepository;
  /** R7：钱包仓储（仅 Prisma 提供）/ Wallet repository (Prisma lane only). */
  readonly walletRepository?: IWalletRepository;
}

/**
 * Creates a Prisma-backed goal module instance.
 * 创建基于 Prisma 的目标模块实例。
 *
 * Convenience root kept for in-package reuse / rollback; delegates to
 * createGoalPrismaRepositories() plus the canonical module assembly.
 *
 * 便捷组合根，保留用于包内复用与回滚；委托给
 * createGoalPrismaRepositories() 与规范化模块装配。
 *
 * @param db - Prisma client owned by the host runtime. 宿主运行时持有的 Prisma client。
 * @param options - Host wiring options: the required Task -> Goal read port and optional runtime contributions.
 *                  宿主接线选项：必需的 Task -> Goal 读取端口与可选运行时贡献。
 * @returns GoalModuleInstance with Prisma-backed repositories attached.
 *          返回挂载 Prisma 仓储的目标模块实例。
 */
export function createGoalPrismaModule(
  db: PrismaClient,
  options: {
    runtimeContributions?: GoalRuntimeContributionsInput;
    /** Required: W0 GoalDependencyReadPort implementation (provided by the Task package). */
    taskBindingReadPort: GoalDependencyReadPort;
    /** Required because the Prisma lane enables Habit. */
    userTimeContextPort: UserTimeContextPort;
    /** Shared Relation supplies a transaction-scoped cleanup adapter. */
    relationCleanupFactory: PrismaGoalRelationCleanupFactory;
  },
): GoalModuleInstance {
  if (!options?.taskBindingReadPort) {
    throw new Error('[FAIL-CLOSED] createGoalPrismaModule requires options.taskBindingReadPort');
  }
  if (!options?.userTimeContextPort) {
    throw new Error('[FAIL-CLOSED] createGoalPrismaModule requires options.userTimeContextPort');
  }
  if (!options?.relationCleanupFactory) {
    throw new Error('[FAIL-CLOSED] createGoalPrismaModule requires options.relationCleanupFactory');
  }
  const {
    goalRepository,
    goalRecordRepository,
    goalWriteTransactionRunner,
    habitRepository,
    walletRepository,
  } = createGoalPrismaRepositories(db);
  return createGoalModule({
    goalRepository,
    goalRecordRepository,
    goalWriteTransactionRunner,
    goalDeletionTransactionRunner: new PrismaGoalDeletionTransactionRunner(
      db,
      options.relationCleanupFactory,
    ),
    taskBindingReadPort: options.taskBindingReadPort,
    userTimeContextPort: options.userTimeContextPort,
    runtimeContributions: options?.runtimeContributions,
    habitRepository,
    walletRepository,
  });
}

/**
 * Creates Prisma-backed goal repositories.
 * 创建基于 Prisma 的目标仓储。
 *
 * Host-level composition ingredient: selects the Prisma adapters and returns the
 * repository Port shape. Includes the transaction runner and the optional habit
 * repository (R4), completing the full GoalRepositorySet.
 *
 * 宿主级组合原料：选择 Prisma 适配器并返回仓储 Port 形状。
 * 包含事务运行器与可选习惯仓储（R4），补全完整的 GoalRepositorySet。
 *
 * @param db - Prisma client owned by the host runtime. 宿主运行时持有的 Prisma client。
 * @returns Repository set backed by the Prisma adapters. 基于 Prisma 适配器的仓储集合。
 */
export function createGoalPrismaRepositories(db: PrismaClient): GoalRepositorySet {
  return {
    goalRepository: new GoalPrismaRepository(db),
    goalRecordRepository: new GoalRecordPrismaRepository(db),
    goalWriteTransactionRunner: new PrismaGoalWriteTransactionRunner(db),
    // R4：习惯仓储（Habit 模块）
    habitRepository: new PrismaHabitRepository(db),
    // R7：钱包仓储（Wallet 外部模块）
    walletRepository: new WalletPrismaRepository(db),
  };
}

export function createGoalPrismaDeletionTransactionRunner(
  db: PrismaClient,
  relationCleanupFactory: PrismaGoalRelationCleanupFactory,
): PrismaGoalDeletionTransactionRunner {
  return new PrismaGoalDeletionTransactionRunner(db, relationCleanupFactory);
}

/** Host-level Task -> Goal integration handler backed by one Goal transaction. */
export function createGoalTaskProgressPrismaHandler(db: PrismaClient) {
  const repositories = createGoalPrismaRepositories(db);
  return createGoalTaskProgressHandler(
    repositories.goalRepository,
    repositories.goalRecordRepository,
    repositories.goalWriteTransactionRunner,
  );
}

export function createGoalPrismaScheduleProjectionSource(
  db: PrismaClient,
  userTimeContextPort: UserTimeContextPort,
): GoalScheduleProjectionSource {
  const repositories = createGoalPrismaRepositories(db);

  return createGoalScheduleProjectionSource({
    goalRepository: repositories.goalRepository,
    userTimeContextPort,
  });
}

export function createGoalPrismaReminderFireHandler(
  db: PrismaClient,
  requestedWriter: NotificationRequestedWriterPort,
): ScheduledHandlerRegistration<GoalReminderFirePayload> {
  return createGoalReminderFireHandler({
    goalRepository: createGoalPrismaRepositories(db).goalRepository,
    requestedWriter,
  });
}

export type { PrismaGoalRelationCleanupFactory };
