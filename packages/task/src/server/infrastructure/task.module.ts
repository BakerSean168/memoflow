/**
 * createTaskModule — explicit composition root for the task server runtime.
 * createTaskModule —— 任务模块服务端运行时的显式组合根。
 *
 * The outer app selects concrete adapters and passes them in here.
 * This module then assembles the application layer exactly once and exposes a
 * stable facade to HTTP / IPC transports.
 *
 * 外层应用负责选择具体适配器并传入这里。
 * 组合根只做一次组装，然后向 HTTP / IPC 等传输层暴露稳定门面。
 *
 * Task uses this file as the package's "living documentation" example for
 * the target monorepo pattern: one composition root per module, constructor
 * injection only, no hidden service locator.
 */

import type { ITaskPlanRepository } from '../domain/repositories/i-task-plan-repository';
import { createTaskOccurrenceMaintenanceRuntime } from './runtime/task-occurrence-maintenance-runtime';
import type { ITaskOccurrenceRepository } from '../domain/repositories/i-task-occurrence-repository';
import { CreateTaskPlanUseCase } from '../application/use-cases/commands/create-task-plan.use-case';
import { GetTaskPlanUseCase } from '../application/use-cases/queries/get-task-plan.use-case';
import { ListTaskPlansUseCase } from '../application/use-cases/queries/list-task-plans.use-case';
import { UpdateTaskPlanUseCase } from '../application/use-cases/commands/update-task-plan.use-case';
import { ActivateTaskPlanUseCase } from '../application/use-cases/commands/activate-task-plan.use-case';
import { PauseTaskPlanUseCase } from '../application/use-cases/commands/pause-task-plan.use-case';
import { ArchiveTaskPlanUseCase } from '../application/use-cases/commands/archive-task-plan.use-case';
import { AbandonTaskPlanUseCase } from '../application/use-cases/commands/abandon-task-plan.use-case';
import { DeleteTaskPlanUseCase } from '../application/use-cases/commands/delete-task-plan.use-case';
import { CompleteTaskOccurrenceUseCase } from '../application/use-cases/commands/complete-task-occurrence.use-case';
import { UncompleteTaskOccurrenceUseCase } from '../application/use-cases/commands/uncomplete-task-occurrence.use-case';
import { SkipTaskOccurrenceUseCase } from '../application/use-cases/commands/skip-task-occurrence.use-case';
import { GetTaskOccurrencesByDateRangeUseCase } from '../application/use-cases/queries/get-task-occurrences-by-date-range.use-case';
import { GetTaskOccurrenceUseCase } from '../application/use-cases/queries/get-task-occurrence.use-case';
import { ListTaskOccurrencesByAccountUseCase } from '../application/use-cases/queries/list-task-occurrences-by-account.use-case';
import { ListTaskOccurrencesByTemplateUseCase } from '../application/use-cases/queries/list-task-occurrences-by-template.use-case';
import { ListTaskOccurrencesByStatusUseCase } from '../application/use-cases/queries/list-task-occurrences-by-status.use-case';
import { StartTaskOccurrenceUseCase } from '../application/use-cases/commands/start-task-occurrence.use-case';
import { DeleteTaskOccurrenceUseCase } from '../application/use-cases/commands/delete-task-occurrence.use-case';
import { GenerateTaskOccurrencesUseCase } from '../application/use-cases/commands/generate-task-occurrences.use-case';
import { BindTaskToGoalUseCase } from '../application/use-cases/commands/bind-task-to-goal.use-case';
import { UnbindTaskFromGoalUseCase } from '../application/use-cases/commands/unbind-task-from-goal.use-case';
import { MarkTaskOccurrenceMissedUseCase } from '../application/use-cases/commands/mark-task-occurrence-missed.use-case';
import { RescheduleTaskOccurrenceUseCase } from '../application/use-cases/commands/reschedule-task-occurrence.use-case';
import type { TaskWriteTransactionRunner } from '../application/use-cases/commands/task-write-support';
import type { TaskApplicationPort } from '../application';
import { TaskOccurrenceProjectionService } from '../application/services/task-occurrence-projection.service';
import { createLogger } from '@memoflow/utils/logger';
import type { UserTimeContextPort } from '@memoflow/time';

const logger = createLogger('TaskModule');

// ---------------------------------------------------------------------------
// 1. Dependencies — everything the task server runtime needs from the outside.
//    依赖 — 任务模块服务端运行时向外部索取的全部依赖。
// ---------------------------------------------------------------------------

/**
 * Optional runtime side effects the module owns.
 * 模块拥有的可选运行时副作用。
 *
 * A contribution is the unit we start/stop together with the module instance.
 * This replaces the older global InitializationManager registration.
 */
export interface TaskModuleRuntimeContribution {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type TaskRuntimeContributionsInput =
  TaskModuleRuntimeContribution | readonly TaskModuleRuntimeContribution[];

/**
 * Everything the task server runtime needs from the outside world.
 * 任务模块服务端运行时向外部索取的全部依赖。
 *
 * Refactor rule for other modules:
 * - only put ports or runtime contributions here
 * - never put transport objects (Express req/res, ipcMain, Router) here
 * - never hide these dependencies behind a singleton container
 */
export interface TaskModuleDependencies {
  readonly taskPlanRepository: ITaskPlanRepository;
  readonly taskOccurrenceRepository: ITaskOccurrenceRepository;
  readonly taskWriteTransactionRunner: TaskWriteTransactionRunner;
  readonly userTimeContextPort: UserTimeContextPort;
  readonly runtimeContributions?: TaskRuntimeContributionsInput;
}

// ---------------------------------------------------------------------------
// 2. Use Cases — lower-level assembled use case collection.
//    已完成接线的底层 use case 集合。
// ---------------------------------------------------------------------------

/**
 * Lower-level assembled use cases.
 * 已完成接线的底层 use case 集合。
 *
 * We keep this type because tests and low-level assembly sometimes need direct
 * access to use-case objects, but transports should prefer `TaskApplicationPort`.
 */
export interface TaskModuleUseCases {
  // Template commands
  readonly createTaskPlan: CreateTaskPlanUseCase;
  readonly updateTaskPlan: UpdateTaskPlanUseCase;
  readonly activateTaskPlan: ActivateTaskPlanUseCase;
  readonly pauseTaskPlan: PauseTaskPlanUseCase;
  readonly archiveTaskPlan: ArchiveTaskPlanUseCase;
  readonly abandonTaskPlan: AbandonTaskPlanUseCase;
  readonly deleteTaskPlan: DeleteTaskPlanUseCase;
  readonly generateTaskOccurrences: GenerateTaskOccurrencesUseCase;
  readonly bindTaskToGoal: BindTaskToGoalUseCase;
  readonly unbindTaskFromGoal: UnbindTaskFromGoalUseCase;

  // Template queries
  readonly getTaskPlan: GetTaskPlanUseCase;
  readonly listTaskPlans: ListTaskPlansUseCase;

  // Instance commands
  readonly completeTaskOccurrence: CompleteTaskOccurrenceUseCase;
  readonly uncompleteTaskOccurrence: UncompleteTaskOccurrenceUseCase;
  readonly skipTaskOccurrence: SkipTaskOccurrenceUseCase;
  readonly markTaskOccurrenceMissed: MarkTaskOccurrenceMissedUseCase;
  readonly startTaskOccurrence: StartTaskOccurrenceUseCase;
  readonly deleteTaskOccurrence: DeleteTaskOccurrenceUseCase;
  readonly rescheduleTaskOccurrence: RescheduleTaskOccurrenceUseCase;

  // Instance queries
  readonly getTaskOccurrence: GetTaskOccurrenceUseCase;
  readonly listTaskOccurrencesByAccount: ListTaskOccurrencesByAccountUseCase;
  readonly listTaskOccurrencesByTemplate: ListTaskOccurrencesByTemplateUseCase;
  readonly listTaskOccurrencesByStatus: ListTaskOccurrencesByStatusUseCase;
  readonly getTaskOccurrencesByDateRange: GetTaskOccurrencesByDateRangeUseCase;
}

// ---------------------------------------------------------------------------
// 3. Module Instance — the primary return type.
//    模块实例 — 主组合根返回类型。
// ---------------------------------------------------------------------------

/**
 * Primary task composition root return type.
 * 任务模块主组合根返回类型。
 *
 * `api` is the transport-facing surface.
 * `useCases` is kept for low-level tests and diagnostics.
 * `start` / `dispose` own runtime side effects.
 */
export interface TaskModuleInstance {
  readonly taskPlanRepository: ITaskPlanRepository;
  readonly taskOccurrenceRepository: ITaskOccurrenceRepository;
  readonly useCases: TaskModuleUseCases;
  readonly api: TaskApplicationPort;
  start(): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// 4. Assembly helpers and factory.
//    组装函数和工厂。
// ---------------------------------------------------------------------------

// Residual 987 keep-boundary: composition-root local normalize (TaskRuntimeContributionsInput host).
// Sole API/Electron helper lives in normalize-runtime-contributions.ts (avoids circular import).
function normalizeRuntimeContributions(
  runtimeContributions?: TaskRuntimeContributionsInput,
): readonly TaskModuleRuntimeContribution[] {
  if (!runtimeContributions) {
    return [];
  }

  if (Array.isArray(runtimeContributions)) {
    return Array.from(runtimeContributions);
  }

  return [runtimeContributions as TaskModuleRuntimeContribution];
}

/**
 * Pure assembly helper used by the factory and tests.
 * 纯组装函数：给定依赖对象，返回已经接好线的 use case 集合。
 */
export function createTaskUseCases(dependencies: TaskModuleDependencies): TaskModuleUseCases {
  if (!dependencies.taskWriteTransactionRunner) {
    throw new Error(
      'taskWriteTransactionRunner must be explicitly provided to TaskModule (no inline fallback allowed).',
    );
  }

  const { taskPlanRepository, taskOccurrenceRepository, taskWriteTransactionRunner } =
    dependencies;
  const occurrenceProjection = new TaskOccurrenceProjectionService(
    dependencies.userTimeContextPort,
  );
  const listTaskPlans = new ListTaskPlansUseCase(
    taskPlanRepository,
    taskOccurrenceRepository,
    dependencies.userTimeContextPort,
  );

  return {
    // Template commands
    createTaskPlan: new CreateTaskPlanUseCase(
      taskPlanRepository,
      taskOccurrenceRepository,
      taskWriteTransactionRunner,
      dependencies.userTimeContextPort,
    ),
    updateTaskPlan: new UpdateTaskPlanUseCase(
      taskPlanRepository,
      taskOccurrenceRepository,
      taskWriteTransactionRunner,
      dependencies.userTimeContextPort,
    ),
    activateTaskPlan: new ActivateTaskPlanUseCase(
      taskPlanRepository,
      taskOccurrenceRepository,
      taskWriteTransactionRunner,
      dependencies.userTimeContextPort,
    ),
    pauseTaskPlan: new PauseTaskPlanUseCase(
      taskPlanRepository,
      taskOccurrenceRepository,
      taskWriteTransactionRunner,
      dependencies.userTimeContextPort,
    ),
    archiveTaskPlan: new ArchiveTaskPlanUseCase(
      taskPlanRepository,
      dependencies.userTimeContextPort,
    ),
    abandonTaskPlan: new AbandonTaskPlanUseCase(
      taskPlanRepository,
      taskWriteTransactionRunner,
      dependencies.userTimeContextPort,
    ),
    deleteTaskPlan: new DeleteTaskPlanUseCase(
      taskPlanRepository,
      taskOccurrenceRepository,
      taskWriteTransactionRunner,
    ),
    generateTaskOccurrences: new GenerateTaskOccurrencesUseCase(
      taskPlanRepository,
      taskOccurrenceRepository,
      taskWriteTransactionRunner,
      dependencies.userTimeContextPort,
    ),
    bindTaskToGoal: new BindTaskToGoalUseCase(
      taskPlanRepository,
      dependencies.userTimeContextPort,
    ),
    unbindTaskFromGoal: new UnbindTaskFromGoalUseCase(
      taskPlanRepository,
      dependencies.userTimeContextPort,
    ),

    // Template queries
    getTaskPlan: new GetTaskPlanUseCase(
      taskPlanRepository,
      taskOccurrenceRepository,
      dependencies.userTimeContextPort,
    ),
    listTaskPlans,

    // Instance commands
    completeTaskOccurrence: new CompleteTaskOccurrenceUseCase(
      taskOccurrenceRepository,
      taskPlanRepository,
      taskWriteTransactionRunner,
      occurrenceProjection,
    ),
    uncompleteTaskOccurrence: new UncompleteTaskOccurrenceUseCase(
      taskOccurrenceRepository,
      taskWriteTransactionRunner,
      occurrenceProjection,
    ),
    skipTaskOccurrence: new SkipTaskOccurrenceUseCase(
      taskOccurrenceRepository,
      taskWriteTransactionRunner,
      occurrenceProjection,
    ),
    markTaskOccurrenceMissed: new MarkTaskOccurrenceMissedUseCase(
      taskOccurrenceRepository,
      taskWriteTransactionRunner,
      occurrenceProjection,
    ),
    startTaskOccurrence: new StartTaskOccurrenceUseCase(
      taskOccurrenceRepository,
      occurrenceProjection,
    ),
    deleteTaskOccurrence: new DeleteTaskOccurrenceUseCase(taskOccurrenceRepository),
    rescheduleTaskOccurrence: new RescheduleTaskOccurrenceUseCase(
      taskOccurrenceRepository,
      dependencies.userTimeContextPort,
    ),

    // Instance queries
    getTaskOccurrence: new GetTaskOccurrenceUseCase(taskOccurrenceRepository, occurrenceProjection),
    listTaskOccurrencesByAccount: new ListTaskOccurrencesByAccountUseCase(
      taskOccurrenceRepository,
      occurrenceProjection,
    ),
    listTaskOccurrencesByTemplate: new ListTaskOccurrencesByTemplateUseCase(
      taskOccurrenceRepository,
      taskPlanRepository,
      occurrenceProjection,
    ),
    listTaskOccurrencesByStatus: new ListTaskOccurrencesByStatusUseCase(
      taskOccurrenceRepository,
      occurrenceProjection,
    ),
    getTaskOccurrencesByDateRange: new GetTaskOccurrencesByDateRangeUseCase(
      taskOccurrenceRepository,
      occurrenceProjection,
    ),
  };
}

/**
 * Canonical composition root.
 * 规范化的任务模块主组合根。
 *
 * This is the file other modules should copy first when migrating away from a
 * container-based assembly. The expected reading order is:
 * 1. define `Dependencies`
 * 2. define transport-neutral `ApplicationPort`
 * 3. assemble use cases once
 * 4. wrap them in `api`
 * 5. let the module instance own `start` / `dispose`
 */
export function createTaskModule(dependencies: TaskModuleDependencies): TaskModuleInstance {
  if (!dependencies.taskWriteTransactionRunner) {
    throw new Error(
      'taskWriteTransactionRunner must be explicitly provided to TaskModule (no inline fallback allowed).',
    );
  }

  const { taskPlanRepository, taskOccurrenceRepository } = dependencies;

  const runtimeContributions = [
    // R2-3：实例补充 maintenance worker（列表查询保持纯读）。
    createTaskOccurrenceMaintenanceRuntime({
      taskPlanRepository: dependencies.taskPlanRepository,
      taskOccurrenceRepository: dependencies.taskOccurrenceRepository,
      userTimeContextPort: dependencies.userTimeContextPort,
    }),
    ...normalizeRuntimeContributions(dependencies.runtimeContributions),
  ];
  const useCases = createTaskUseCases(dependencies);
  let started = false;

  // The API facade simply exposes the assembled use cases.
  // API 门面只是直接暴露已组装好的 use case。
  const api: TaskApplicationPort = {
    createTaskPlan: (input) => useCases.createTaskPlan.execute(input),
    updateTaskPlan: (id, identityId, input) =>
      useCases.updateTaskPlan.execute(id, identityId, input),
    activateTaskPlan: (id, identityId) => useCases.activateTaskPlan.execute(id, identityId),
    pauseTaskPlan: (id, identityId) => useCases.pauseTaskPlan.execute(id, identityId),
    archiveTaskPlan: (id, identityId) => useCases.archiveTaskPlan.execute(id, identityId),
    abandonTaskPlan: (id, identityId, input) =>
      useCases.abandonTaskPlan.execute(id, identityId, input),
    deleteTaskPlan: (id, identityId) => useCases.deleteTaskPlan.execute(id, identityId),
    generateTaskOccurrences: (id, identityId, input) =>
      useCases.generateTaskOccurrences.execute(id, identityId, input),
    bindTaskToGoal: (id, identityId, input) =>
      useCases.bindTaskToGoal.execute(id, identityId, input),
    unbindTaskFromGoal: (id, identityId) => useCases.unbindTaskFromGoal.execute(id, identityId),
    getTaskPlan: (id, identityId, includeChildren) =>
      useCases.getTaskPlan.execute(id, identityId, includeChildren),
    listTaskPlans: (query) => useCases.listTaskPlans.execute(query),
    completeTaskOccurrence: (id, identityId, input) =>
      useCases.completeTaskOccurrence.execute(id, identityId, input),
    uncompleteTaskOccurrence: (id, identityId) =>
      useCases.uncompleteTaskOccurrence.execute(id, identityId),
    skipTaskOccurrence: (id, identityId, input) =>
      useCases.skipTaskOccurrence.execute(id, identityId, input),
    markTaskOccurrenceMissed: (id, identityId, input) =>
      useCases.markTaskOccurrenceMissed.execute(id, identityId, input),
    startTaskOccurrence: (id, identityId) => useCases.startTaskOccurrence.execute(id, identityId),
    deleteTaskOccurrence: (id, identityId) => useCases.deleteTaskOccurrence.execute(id, identityId),
    rescheduleTaskOccurrence: (id, identityId, input) =>
      useCases.rescheduleTaskOccurrence.execute(id, identityId, input),
    getTaskOccurrence: (id, identityId) => useCases.getTaskOccurrence.execute(id, identityId),
    listTaskOccurrencesByAccount: (identityId) =>
      useCases.listTaskOccurrencesByAccount.execute(identityId),
    listTaskOccurrencesByTemplate: (templateId, identityId) =>
      useCases.listTaskOccurrencesByTemplate.execute(templateId, identityId),
    listTaskOccurrencesByStatus: (identityId, status) =>
      useCases.listTaskOccurrencesByStatus.execute(identityId, status),
    getTaskOccurrencesByDateRange: (identityId, startDate, endDate) =>
      useCases.getTaskOccurrencesByDateRange.execute(identityId, startDate, endDate),
  };

  return {
    taskPlanRepository,
    taskOccurrenceRepository,
    useCases,
    api,
    async start(): Promise<void> {
      if (started) {
        return;
      }

      // R1-3：await 每个 contribution，避免 async runtime 的 floating promise。
      const startedContributions: TaskModuleRuntimeContribution[] = [];
      for (const runtime of runtimeContributions) {
        try {
          await runtime.start();
          startedContributions.push(runtime);
        } catch (error) {
          // Partial-start rollback: await the already-started contributions in
          // REVERSE order (best-effort, logged), then rethrow the ORIGINAL
          // error. `started` stays false, so a later dispose() is a no-op —
          // start() owns its partial-start cleanup.
          for (const startedRuntime of [...startedContributions].reverse()) {
            try {
              await startedRuntime.stop();
            } catch (stopError) {
              logger.error(
                'TaskModule: contribution stop failed during partial-start rollback',
                stopError,
              );
            }
          }
          throw error;
        }
      }

      started = true;
    },
    async dispose(): Promise<void> {
      if (!started) {
        return;
      }

      // R1-3：逆序关闭并等待排空。
      for (const runtime of [...runtimeContributions].reverse()) {
        await runtime.stop();
      }

      started = false;
    },
  };
}
