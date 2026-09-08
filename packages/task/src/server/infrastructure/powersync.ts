/**
 * Convenience factory — PowerSync-backed task module for Electron.
 * 便捷工厂 — 基于 PowerSync 的 Electron 任务模块。
 *
 * Thin factory that selects PowerSync adapters and delegates to the canonical
 * composition root. Used exclusively in Electron main process.
 *
 * 选择 PowerSync 适配器并委托给规范组合根的轻量工厂。
 * 仅在 Electron 主进程中使用。
 */

import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import {
  createTaskModule,
  type TaskModuleInstance,
  type TaskModuleRuntimeContribution,
  type TaskRuntimeContributionsInput,
} from './task.module';
import {
  PowerSyncTaskPlanRepository,
  PowerSyncTaskOccurrenceRepository,
  PowerSyncTaskWriteTransactionRunner,
  PowerSyncTaskGoalOutboxDispatchStore,
} from './adapters/powersync';
import { createTaskGoalOutboxRuntime } from './task-goal-outbox-runtime';
import {
  TaskGoalOutboxDispatcher,
  type TaskGoalProgressHandler,
} from '../application/outbox';
import {
  createTaskScheduleProjectionSource,
} from './schedule-projection-source';
import type { TaskScheduleProjectionSource } from '../../schedule-projection';
import type { TaskRepositorySet } from './prisma';

type TaskPowerSyncQueryable = IElectronDatabaseTransaction;

/**
 * Creates a task module instance with PowerSync adapters.
 * 使用 PowerSync 适配器创建任务模块实例。
 *
 * Convenience root kept for in-package reuse / rollback; delegates to
 * createTaskPowerSyncRepositories() plus the canonical module assembly.
 *
 * 便捷组合根，保留用于包内复用与回滚；委托给
 * createTaskPowerSyncRepositories() 与规范化模块装配。
 *
 * @param db - PowerSync desktop database runtime. PowerSync 桌面数据库运行时。
 * @param runtimeContributions - Optional runtime side effects (e.g. domain event subscriptions).
 *                               可选的运行时副作用（如领域事件订阅）。
 * @returns TaskModuleInstance with PowerSync-backed repositories attached.
 *          返回挂载 PowerSync 仓储的任务模块实例。
 */
export function createTaskPowerSyncModule(
  db: IElectronDatabase,
  runtimeContributions?: TaskRuntimeContributionsInput,
): TaskModuleInstance {
  const {
    taskPlanRepository,
    taskOccurrenceRepository,
    taskWriteTransactionRunner,
  } = createTaskPowerSyncRepositories(db);

  return createTaskModule({
    taskPlanRepository,
    taskOccurrenceRepository,
    taskWriteTransactionRunner,
    runtimeContributions,
  });
}

/**
 * Creates PowerSync-backed task repositories.
 * 创建基于 PowerSync 的任务仓储。
 *
 * Electron counterpart of createTaskPrismaRepositories(): selects the PowerSync
 * adapters and returns the same repository Port shape, so the transport-neutral
 * createTaskModule() is host-agnostic.
 *
 * 与 createTaskPrismaRepositories() 对应的 Electron 版本：选择 PowerSync 适配器并返回
 * 相同的仓储 Port 形状，从而让 transport-neutral 的 createTaskModule() 与宿主技术无关。
 *
 * @param db - Electron database adapter owned by the desktop main runtime. 桌面主进程持有的 Electron 数据库适配器。
 * @returns Repository set backed by the PowerSync adapters. 基于 PowerSync 适配器的仓储集合。
 */
export function createTaskPowerSyncRepositories(db: IElectronDatabase): TaskRepositorySet {
  return {
    taskPlanRepository: new PowerSyncTaskPlanRepository(db),
    taskOccurrenceRepository: new PowerSyncTaskOccurrenceRepository(db),
    taskWriteTransactionRunner: new PowerSyncTaskWriteTransactionRunner(db),
  };
}

/**
 * Creates the durable Task→Goal outbox runtime backed by the PowerSync dispatch store.
 * 创建基于 PowerSync dispatch store 的可靠 Task→Goal outbox runtime。
 *
 * Host-level composition ingredient: wraps the PowerSync store, the
 * TaskGoalOutboxDispatcher and the Goal progress handler into the module-owned
 * runtime contribution, so hosts never import concrete PowerSync adapter classes
 * or the dispatcher directly — the Electron counterpart of
 * createTaskPrismaGoalOutboxRuntime().
 *
 * 宿主级组合原料：把 PowerSync store、TaskGoalOutboxDispatcher 与 Goal progress
 * handler 包装成模块自有运行时贡献，宿主无需直接导入具体 PowerSync 适配器类或
 * dispatcher——与 createTaskPrismaGoalOutboxRuntime() 对应的 Electron 版本。
 *
 * @param db - Electron database adapter owned by the desktop main runtime. 桌面主进程持有的 Electron 数据库适配器。
 * @param goalProgressHandler - Goal's durable Task→Goal progress handler. 目标侧可靠 Task→Goal 进度处理器。
 * @returns A module-owned TaskGoalOutbox runtime contribution. 模块自有的 outbox 运行时贡献。
 */
export function createTaskPowerSyncGoalOutboxRuntime(
  db: IElectronDatabase,
  goalProgressHandler: TaskGoalProgressHandler,
): TaskModuleRuntimeContribution {
  return createTaskGoalOutboxRuntime(
    new TaskGoalOutboxDispatcher(
      new PowerSyncTaskGoalOutboxDispatchStore(db),
      goalProgressHandler,
    ),
  );
}

export function createTaskPowerSyncScheduleProjectionSource(
  db: TaskPowerSyncQueryable,
): TaskScheduleProjectionSource {
  return createTaskScheduleProjectionSource({
    taskPlanRepository: new PowerSyncTaskPlanRepository(db),
    taskOccurrenceRepository: new PowerSyncTaskOccurrenceRepository(db),
  });
}

export {
  PowerSyncTaskPlanRepository,
  PowerSyncTaskOccurrenceRepository,
};
