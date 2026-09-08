/**
 * Convenience factory — PowerSync-backed goal module for Electron.
 * 便捷工厂 — 基于 PowerSync 的 Electron 目标模块。
 *
 * Mirrors `packages/governance/src/infrastructure/powersync.ts`.
 * 对标 `packages/governance/src/infrastructure/powersync.ts`。
 */

import {
  createGoalModule,
  type GoalModuleInstance,
  type GoalRuntimeContributionsInput,
} from './goal.module';
import { GoalPowerSyncRepository } from './adapters/powersync/goal-powersync.repository';
import { GoalRecordPowerSyncRepository } from './adapters/powersync/goal-record-powersync.repository';
import { PowerSyncGoalWriteTransactionRunner } from './adapters/powersync/powersync-goal-write-transaction-runner';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
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
import type { GoalRepositorySet } from './prisma';

/**
 * Creates a PowerSync-backed goal module instance.
 * 创建基于 PowerSync 的目标模块实例。
 *
 * Convenience root kept for in-package reuse / rollback; delegates to
 * createGoalPowerSyncRepositories() plus the canonical module assembly.
 *
 * 便捷组合根，保留用于包内复用与回滚；委托给
 * createGoalPowerSyncRepositories() 与规范化模块装配。
 *
 * @param db - Electron database adapter owned by the desktop main runtime. 桌面主进程持有的 Electron 数据库适配器。
 * @param options - Host wiring options: the required Task -> Goal read port and optional runtime contributions.
 *                  宿主接线选项：必需的 Task -> Goal 读取端口与可选运行时贡献。
 * @returns GoalModuleInstance with PowerSync-backed repositories attached.
 *          返回挂载 PowerSync 仓储的目标模块实例。
 */
export function createGoalPowerSyncModule(
  db: IElectronDatabase,
  options: {
    runtimeContributions?: GoalRuntimeContributionsInput;
    /** Required: W0 GoalDependencyReadPort implementation (provided by the Task package). */
    taskBindingReadPort: GoalDependencyReadPort;
  },
): GoalModuleInstance {
  if (!options?.taskBindingReadPort) {
    throw new Error('[FAIL-CLOSED] createGoalPowerSyncModule requires options.taskBindingReadPort');
  }
  const { goalRepository, goalRecordRepository, goalWriteTransactionRunner } =
    createGoalPowerSyncRepositories(db);
  return createGoalModule({
    goalRepository,
    goalRecordRepository,
    goalWriteTransactionRunner,
    taskBindingReadPort: options.taskBindingReadPort,
    runtimeContributions: options?.runtimeContributions,
  });
}

/**
 * Creates PowerSync-backed goal repositories.
 * 创建基于 PowerSync 的目标仓储。
 *
 * Electron counterpart of createGoalPrismaRepositories(): selects the PowerSync
 * adapters and returns the same repository Port shape, so the transport-neutral
 * createGoalModule() is host-agnostic. PowerSync has no habit adapter, so
 * `habitRepository` stays undefined.
 *
 * 与 createGoalPrismaRepositories() 对应的 Electron 版本：选择 PowerSync 适配器并返回
 * 相同的仓储 Port 形状，从而让 transport-neutral 的 createGoalModule() 与宿主技术无关。
 * PowerSync 没有习惯适配器，因此 `habitRepository` 保持未提供。
 *
 * @param db - Electron database adapter owned by the desktop main runtime. 桌面主进程持有的 Electron 数据库适配器。
 * @returns Repository set backed by the PowerSync adapters. 基于 PowerSync 适配器的仓储集合。
 */
export function createGoalPowerSyncRepositories(db: IElectronDatabase): GoalRepositorySet {
  return {
    goalRepository: new GoalPowerSyncRepository(db),
    goalRecordRepository: new GoalRecordPowerSyncRepository(db),
    goalWriteTransactionRunner: new PowerSyncGoalWriteTransactionRunner(db),
  };
}

export function createGoalPowerSyncScheduleProjectionSource(
  db: IElectronDatabase,
): GoalScheduleProjectionSource {
  return createGoalScheduleProjectionSource({
    goalRepository: createGoalPowerSyncRepositories(db).goalRepository,
  });
}

/** Desktop Task -> Goal integration handler backed by one PowerSync transaction. */
export function createGoalTaskProgressPowerSyncHandler(db: IElectronDatabase) {
  const repositories = createGoalPowerSyncRepositories(db);
  return createGoalTaskProgressHandler(
    repositories.goalRepository,
    repositories.goalRecordRepository,
    repositories.goalWriteTransactionRunner,
  );
}

export function createGoalPowerSyncReminderFireHandler(
  db: IElectronDatabase,
  requestedWriter: NotificationRequestedWriterPort,
): ScheduledHandlerRegistration<GoalReminderFirePayload> {
  return createGoalReminderFireHandler({
    goalRepository: createGoalPowerSyncRepositories(db).goalRepository,
    requestedWriter,
  });
}

export { GoalPowerSyncRepository, GoalRecordPowerSyncRepository };
