/**
 * Task Prisma Composition Helpers
 *
 * Public-facing convenience factories for composing the task module
 * with Prisma-backed repositories.
 */

import type { PrismaClient } from '@memoflow/database';
import {
  createTaskModule,
  type TaskModuleInstance,
  type TaskModuleRuntimeContribution,
} from './task.module';
import {
  PrismaTaskWriteTransactionRunner,
  TaskInstancePrismaRepository,
  TaskTemplatePrismaRepository,
} from './adapters/prisma';
import { PrismaTaskGoalOutboxDispatchStore } from './adapters/prisma/prisma-task-goal-outbox-dispatch-store';
import {
  TaskGoalOutboxDispatcher,
  type TaskGoalProgressHandler,
} from '../application/outbox';
import { createTaskGoalOutboxRuntime } from './task-goal-outbox-runtime';
import { createTaskScheduleProjectionSource } from './schedule-projection-source';
import type { TaskScheduleProjectionSource } from '../../schedule-projection';
import type { ITaskInstanceRepository } from '../domain/repositories/i-task-instance-repository';
import type { ITaskTemplateRepository } from '../domain/repositories/i-task-template-repository';
import type { TaskWriteTransactionRunner } from '../application/use-cases/commands/task-write-support';

export interface CreateTaskPrismaModuleOptions {
  readonly runtimeContributions?:
    | TaskModuleRuntimeContribution
    | readonly TaskModuleRuntimeContribution[];
}

/**
 * Host-facing task repository set.
 * 面向宿主暴露的任务仓储集合。
 *
 * Represents the repository Ports that persistence adapters must satisfy.
 * Concrete adapter classes never cross this seam — hosts consume repositories
 * only through these interfaces.
 *
 * 表示持久化适配器必须满足的仓储 Port。
 * 具体适配器类从不越过该 seam——宿主只能通过这些接口使用仓储。
 *
 */
export interface TaskRepositorySet {
  readonly taskTemplateRepository: ITaskTemplateRepository;
  readonly taskInstanceRepository: ITaskInstanceRepository;
  readonly taskWriteTransactionRunner: TaskWriteTransactionRunner;
}

/**
 * Create a fully-wired task module backed by Prisma repositories.
 * 创建基于 Prisma 仓储的完整任务模块。
 *
 * Convenience root kept for in-package reuse / rollback; delegates to
 * createTaskPrismaRepositories() plus the canonical module assembly.
 *
 * 便捷组合根，保留用于包内复用与回滚；委托给
 * createTaskPrismaRepositories() 与规范化模块装配。
 *
 * @param db - Prisma client owned by the host runtime. 宿主运行时持有的 Prisma client。
 * @param options - Optional runtime contributions. 可选的运行时贡献。
 * @returns TaskModuleInstance with Prisma-backed repositories attached.
 *          返回挂载 Prisma 仓储的任务模块实例。
 */
export function createTaskPrismaModule(
  db: PrismaClient,
  options: CreateTaskPrismaModuleOptions = {},
): TaskModuleInstance {
  const {
    taskTemplateRepository,
    taskInstanceRepository,
    taskWriteTransactionRunner,
  } = createTaskPrismaRepositories(db);

  return createTaskModule({
    taskTemplateRepository,
    taskInstanceRepository,
    taskWriteTransactionRunner,
    runtimeContributions: options.runtimeContributions,
  });
}

/**
 * Creates Prisma-backed task repositories.
 * 创建基于 Prisma 的任务仓储。
 *
 * Host-level composition ingredient: selects the Prisma adapters and returns the
 * repository Port shape. Includes the transaction runner, completing the full
 * TaskRepositorySet.
 *
 * 宿主级组合原料：选择 Prisma 适配器并返回仓储 Port 形状。
 * 包含事务运行器，补全完整的 TaskRepositorySet。
 *
 * @param db - Prisma client owned by the host runtime. 宿主运行时持有的 Prisma client。
 * @returns Repository set backed by the Prisma adapters. 基于 Prisma 适配器的仓储集合。
 */
export function createTaskPrismaRepositories(db: PrismaClient): TaskRepositorySet {
  return {
    taskTemplateRepository: new TaskTemplatePrismaRepository(db),
    taskInstanceRepository: new TaskInstancePrismaRepository(db),
    taskWriteTransactionRunner: new PrismaTaskWriteTransactionRunner(db),
  };
}

/**
 * Creates the durable Task→Goal outbox runtime backed by the Prisma dispatch store.
 * 创建基于 Prisma dispatch store 的可靠 Task→Goal outbox runtime。
 *
 * Host-level composition ingredient: wraps the Prisma store, the TaskGoalOutboxDispatcher
 * and the Goal progress handler into the module-owned runtime contribution, so hosts
 * never import concrete Prisma adapter classes or the dispatcher directly.
 *
 * 宿主级组合原料：把 Prisma store、TaskGoalOutboxDispatcher 与 Goal progress handler
 * 包装成模块自有运行时贡献，宿主无需直接导入具体 Prisma 适配器类或 dispatcher。
 *
 * @param db - Prisma client owned by the host runtime. 宿主运行时持有的 Prisma client。
 * @param goalProgressHandler - Goal's durable Task→Goal progress handler. 目标侧可靠 Task→Goal 进度处理器。
 * @returns A module-owned TaskGoalOutbox runtime contribution. 模块自有的 outbox 运行时贡献。
 */
export function createTaskPrismaGoalOutboxRuntime(
  db: PrismaClient,
  goalProgressHandler: TaskGoalProgressHandler,
): TaskModuleRuntimeContribution {
  return createTaskGoalOutboxRuntime(
    new TaskGoalOutboxDispatcher(
      new PrismaTaskGoalOutboxDispatchStore(db),
      goalProgressHandler,
    ),
  );
}

export function createTaskPrismaScheduleProjectionSource(
  db: PrismaClient,
): TaskScheduleProjectionSource {
  const repositories = createTaskPrismaRepositories(db);

  return createTaskScheduleProjectionSource({
    taskTemplateRepository: repositories.taskTemplateRepository,
    taskInstanceRepository: repositories.taskInstanceRepository,
  });
}
