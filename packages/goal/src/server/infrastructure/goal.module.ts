/**
 * createGoalModule — explicit composition root for the goal server runtime.
 * createGoalModule —— 目标模块服务端运行时的显式组合根。
 *
 * The outer app selects concrete adapters and passes them in here.
 * This module then assembles the application layer exactly once and exposes a
 * stable facade to HTTP / IPC transports.
 *
 * 外层应用负责选择具体适配器并传入这里。
 * 组合根只做一次组装，然后向 HTTP / IPC 等传输层暴露稳定门面。
 *
 * Goal uses the governance module as reference pattern: one composition root per
 * module, constructor injection only, no hidden service locator.
 * 目标模块以 governance 模块为参考模式：每个模块只有一个组合根，
 * 只使用构造函数注入，不使用隐藏的服务定位器。
 */

import type {
  IGoalRepository,
  IGoalRecordRepository,
  IRelationRepository,
  IWalletRepository,
} from '../domain';
import { GoalPolicy } from '../domain';
import {
  CreateGoalUseCase,
  GetGoalUseCase,
  ListGoalsUseCase,
  UpdateGoalUseCase,
  DeleteGoalUseCase,
  ArchiveGoalUseCase,
  ActivateGoalUseCase,
  AbandonGoalUseCase,
  CompleteGoalUseCase,
  SearchGoalsUseCase,
  AddGoalKeyResultUseCase,
  UpdateGoalKeyResultUseCase,
  UpdateGoalKeyResultProgressUseCase,
  DeleteGoalKeyResultUseCase,
  AddGoalReviewUseCase,
  ListGoalReviewsUseCase,
  GetGoalReviewContextUseCase,
  UpdateGoalReviewUseCase,
  DeleteGoalReviewUseCase,
  CreateGoalRecordUseCase,
  UpdateGoalRecordUseCase,
  ListGoalRecordsUseCase,
  DeleteGoalRecordUseCase,
  PermanentlyDeleteGoalUseCase,
  GetGoalAggregateUseCase,
  CloneGoalUseCase,
  BatchUpdateKeyResultWeightsUseCase,
} from '../application';
import type { GoalSystemView } from '@memoflow/contracts/goal';
import { GoalReviewContextBuilder } from '../application';
import { createLogger } from '@memoflow/utils/logger';
import type { GoalApplicationPort } from '../application';
import type { GoalDependencyReadPort } from '@memoflow/contracts/reliable-messaging';
import type { GoalWriteTransactionRunner } from '../application/use-cases/commands/goal-write-support';
import {
  CreateHabitUseCase,
  RecordHabitCheckInUseCase,
  ListHabitUseCase,
  type IHabitRepository,
} from '../application/use-cases/commands/habit.use-cases';
import {
  CreateRelationUseCase,
  ListRelationsUseCase,
} from '../application/use-cases/commands/relation.use-cases';
import {
  CreateWalletAccountUseCase,
  ListWalletUseCase,
  RecordWalletTransactionUseCase,
} from '../application/use-cases/commands/wallet.use-cases';

const logger = createLogger('GoalModule');

// ---------------------------------------------------------------------------
// Dependencies — everything the goal server runtime needs from the outside.
// 依赖 — 目标模块服务端运行时向外部索取的全部依赖。
//
// Refactor rule (same as governance):
// - only put ports or runtime contributions here
// - never put transport objects (Express req/res, ipcMain, Router) here
// - never hide these dependencies behind a singleton container
// ---------------------------------------------------------------------------

export type GoalRuntimeContributionsInput =
  GoalModuleRuntimeContribution | readonly GoalModuleRuntimeContribution[];

export interface GoalModuleDependencies {
  readonly goalRepository: IGoalRepository;
  readonly goalRecordRepository: IGoalRecordRepository;
  readonly goalWriteTransactionRunner: GoalWriteTransactionRunner;
  readonly taskBindingReadPort: GoalDependencyReadPort;
  readonly runtimeContributions?: GoalRuntimeContributionsInput;
  /** R4：习惯仓储（可选；提供时启用 habit use cases）。 */
  readonly habitRepository?: IHabitRepository;
  /** R5：关系仓储（可选；提供时启用 relation use cases）。 */
  readonly relationRepository?: IRelationRepository;
  /** R7：钱包仓储（可选；提供时启用 wallet use cases）。 */
  readonly walletRepository?: IWalletRepository;
}

/**
 * Module-owned runtime side effects.
 * 模块拥有的运行时副作用。
 *
 * A contribution is the unit we start/stop together with the module instance.
 * This is the replacement for older global initialization hooks.
 * 贡献是我们与模块实例一起启动/停止的单元。
 * 这是旧的全局初始化钩子的替代品。
 */
export interface GoalModuleRuntimeContribution {
  start(): void;
  stop(): void;
}

// ---------------------------------------------------------------------------
// Use Cases — lower-level assembled use case collection.
// 用例 — 已完成接线的底层 use case 集合。
//
// We keep this type because tests and low-level assembly sometimes need direct
// access to use-case objects, but transports should prefer `GoalApplicationPort`.
// 保留此类型供测试和底层组装直接使用，传输层应优先使用 `GoalApplicationPort`。
// ---------------------------------------------------------------------------

export interface GoalModuleUseCases {
  // R4 Habit / 习惯
  readonly habit?: {
    readonly create: CreateHabitUseCase;
    readonly checkIn: RecordHabitCheckInUseCase;
    readonly list: ListHabitUseCase;
  };
  // R5 Relation / 关系
  readonly relation?: {
    readonly create: CreateRelationUseCase;
    readonly list: ListRelationsUseCase;
  };
  // R7 Wallet / 钱包
  readonly wallet?: {
    readonly createAccount: CreateWalletAccountUseCase;
    readonly recordTransaction: RecordWalletTransactionUseCase;
    readonly list: ListWalletUseCase;
  };
  // Goal CRUD / 目标增删改查
  readonly createGoal: CreateGoalUseCase;
  readonly getGoal: GetGoalUseCase;
  readonly listGoals: ListGoalsUseCase;
  readonly updateGoal: UpdateGoalUseCase;
  readonly deleteGoal: DeleteGoalUseCase;
  readonly permanentlyDeleteGoal: PermanentlyDeleteGoalUseCase;
  readonly archiveGoal: ArchiveGoalUseCase;
  readonly activateGoal: ActivateGoalUseCase;
  readonly abandonGoal: AbandonGoalUseCase;
  readonly completeGoal: CompleteGoalUseCase;
  readonly searchGoals: SearchGoalsUseCase;

  // Key Result / 关键结果
  readonly addKeyResult: AddGoalKeyResultUseCase;
  readonly updateKeyResult: UpdateGoalKeyResultUseCase;
  readonly updateKeyResultProgress: UpdateGoalKeyResultProgressUseCase;
  readonly deleteKeyResult: DeleteGoalKeyResultUseCase;

  // Review / 复盘
  readonly addReview: AddGoalReviewUseCase;
  readonly listReviews: ListGoalReviewsUseCase;
  readonly getReviewContext: GetGoalReviewContextUseCase;
  readonly updateReview: UpdateGoalReviewUseCase;
  readonly deleteReview: DeleteGoalReviewUseCase;

  // Record / 进度记录
  readonly createRecord: CreateGoalRecordUseCase;
  readonly updateRecord: UpdateGoalRecordUseCase;
  readonly listRecords: ListGoalRecordsUseCase;
  readonly deleteRecord: DeleteGoalRecordUseCase;

  // Workflow / 工作流
  readonly getGoalAggregate: GetGoalAggregateUseCase;
  readonly cloneGoal: CloneGoalUseCase;
  readonly batchUpdateKeyResultWeights: BatchUpdateKeyResultWeightsUseCase;
}

/**
 * Primary goal composition root return type.
 * 目标模块主组合根返回类型。
 *
 * `api` is the transport-facing surface.
 * `api` 是面向传输层的门面。
 * `useCases` is kept for low-level tests and diagnostics.
 * `useCases` 保留供底层测试和诊断使用。
 * `start` / `dispose` own runtime side effects (event subscriptions, etc.).
 * `start` / `dispose` 负责运行时副作用（事件订阅等）。
 */
export interface GoalModuleInstance {
  readonly goalRepository: IGoalRepository;
  readonly goalRecordRepository: IGoalRecordRepository;
  readonly goalWriteTransactionRunner: GoalWriteTransactionRunner;
  readonly useCases: GoalModuleUseCases;
  readonly api: GoalApplicationPort;
  start(): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Pure assembly helper — can be used by tests directly.
// 纯组装函数 — 可以直接被测试使用。
// ---------------------------------------------------------------------------

export function createGoalUseCases(deps: GoalModuleDependencies): GoalModuleUseCases {
  if (!deps.goalWriteTransactionRunner) {
    throw new Error(
      'goalWriteTransactionRunner must be explicitly provided to GoalModule (no inline fallback allowed).',
    );
  }
  if (!deps.taskBindingReadPort) {
    throw new Error(
      'taskBindingReadPort must be explicitly provided to GoalModule (no inline fallback allowed).',
    );
  }

  const { goalRepository, goalRecordRepository, goalWriteTransactionRunner, taskBindingReadPort } =
    deps;

  const goalPolicy = new GoalPolicy();

  const habitRepository: IHabitRepository | undefined = deps.habitRepository;
  const relationRepository: IRelationRepository | undefined = deps.relationRepository;
  const walletRepository: IWalletRepository | undefined = deps.walletRepository;

  return {
    // R4 Habit（可选：未注入仓储时不启用）
    ...(habitRepository
      ? {
          habit: {
            create: new CreateHabitUseCase(habitRepository),
            checkIn: new RecordHabitCheckInUseCase(habitRepository),
            list: new ListHabitUseCase(habitRepository),
          },
        }
      : {}),
    // R5 Relation（可选：未注入仓储时不启用）
    ...(relationRepository
      ? {
          relation: {
            create: new CreateRelationUseCase(relationRepository),
            list: new ListRelationsUseCase(relationRepository),
          },
        }
      : {}),
    // R7 Wallet（可选：未注入仓储时不启用）
    ...(walletRepository
      ? {
          wallet: {
            createAccount: new CreateWalletAccountUseCase(walletRepository),
            recordTransaction: new RecordWalletTransactionUseCase(walletRepository),
            list: new ListWalletUseCase(walletRepository),
          },
        }
      : {}),
    // Goal CRUD / 目标增删改查
    createGoal: new CreateGoalUseCase(goalRepository, goalPolicy, goalWriteTransactionRunner),
    getGoal: new GetGoalUseCase(goalRepository),
    listGoals: new ListGoalsUseCase(goalRepository),
    updateGoal: new UpdateGoalUseCase(goalRepository, goalPolicy, goalWriteTransactionRunner),
    deleteGoal: new DeleteGoalUseCase(goalRepository, goalPolicy, taskBindingReadPort),
    permanentlyDeleteGoal: new PermanentlyDeleteGoalUseCase(goalRepository, goalPolicy),
    archiveGoal: new ArchiveGoalUseCase(goalRepository, goalPolicy, goalWriteTransactionRunner),
    activateGoal: new ActivateGoalUseCase(goalRepository, goalPolicy),
    abandonGoal: new AbandonGoalUseCase(goalRepository, goalPolicy),
    completeGoal: new CompleteGoalUseCase(goalRepository, goalPolicy, goalWriteTransactionRunner),
    searchGoals: new SearchGoalsUseCase(goalRepository),

    // Key Result / 关键结果
    addKeyResult: new AddGoalKeyResultUseCase(goalRepository, goalPolicy),
    updateKeyResult: new UpdateGoalKeyResultUseCase(goalRepository, goalPolicy),
    updateKeyResultProgress: new UpdateGoalKeyResultProgressUseCase(goalRepository, goalPolicy),
    deleteKeyResult: new DeleteGoalKeyResultUseCase(goalRepository, goalPolicy),

    // Review / 复盘
    addReview: new AddGoalReviewUseCase(
      goalRepository,
      goalPolicy,
      new GoalReviewContextBuilder(goalRecordRepository),
    ),
    listReviews: new ListGoalReviewsUseCase(goalRepository),
    getReviewContext: new GetGoalReviewContextUseCase(
      goalRepository,
      new GoalReviewContextBuilder(goalRecordRepository),
    ),
    updateReview: new UpdateGoalReviewUseCase(goalRepository, goalPolicy),
    deleteReview: new DeleteGoalReviewUseCase(goalRepository, goalPolicy),

    // Record / 进度记录
    createRecord: new CreateGoalRecordUseCase(
      goalRepository,
      goalRecordRepository,
      goalWriteTransactionRunner,
    ),
    updateRecord: new UpdateGoalRecordUseCase(
      goalRepository,
      goalRecordRepository,
      goalWriteTransactionRunner,
    ),
    listRecords: new ListGoalRecordsUseCase(goalRecordRepository, goalRepository),
    deleteRecord: new DeleteGoalRecordUseCase(
      goalRepository,
      goalRecordRepository,
      goalWriteTransactionRunner,
    ),

    // Workflow / 工作流
    getGoalAggregate: new GetGoalAggregateUseCase(goalRepository, goalRecordRepository),
    cloneGoal: new CloneGoalUseCase(
      goalRepository,
      new CreateGoalUseCase(goalRepository, goalPolicy, goalWriteTransactionRunner),
    ),
    batchUpdateKeyResultWeights: new BatchUpdateKeyResultWeightsUseCase(
      goalWriteTransactionRunner,
      goalPolicy,
    ),
  };
}

// ---------------------------------------------------------------------------
// Runtime contribution normalization helper.
// 运行时贡献规范化辅助函数。
// ---------------------------------------------------------------------------

/**
 * Normalizes a single-or-array runtime contributions input into an array.
 * 将单个或数组形式的运行时贡献输入规范化为数组。
 *
 * Exported so both host composers (apps/api + apps/desktop) reuse the same
 * normalization instead of carrying private copies; `createGoalModule` accepts
 * the same single-or-array input and normalizes internally.
 *
 * 从包根导出，供两个宿主 composer（apps/api 与 apps/desktop）复用同一份
 * 规范化逻辑，避免各自维护私有副本；`createGoalModule` 本身也接受
 * 单个或数组输入并在内部规范化。
 */
export function normalizeGoalRuntimeContributions(
  input?: GoalRuntimeContributionsInput,
): readonly GoalModuleRuntimeContribution[] {
  if (!input) return [];
  if (Array.isArray(input)) return Array.from(input);
  return [input as GoalModuleRuntimeContribution];
}

// ---------------------------------------------------------------------------
// Canonical composition root.
// 规范化的目标模块主组合根。
//
// Reading order (same as governance):
// 1. define `Dependencies`
// 2. define transport-neutral `ApplicationPort`
// 3. assemble use cases once
// 4. wrap them in `api`
// 5. let the module instance own `start` / `dispose`
// ---------------------------------------------------------------------------

export function createGoalModule(deps: GoalModuleDependencies): GoalModuleInstance {
  if (!deps.goalWriteTransactionRunner) {
    throw new Error(
      'goalWriteTransactionRunner must be explicitly provided to GoalModule (no inline fallback allowed).',
    );
  }
  if (!deps.taskBindingReadPort) {
    throw new Error(
      'taskBindingReadPort must be explicitly provided to GoalModule (no inline fallback allowed).',
    );
  }
  const { goalRepository, goalRecordRepository, goalWriteTransactionRunner } = deps;
  const runtimeContributions = normalizeGoalRuntimeContributions(deps.runtimeContributions);
  const useCases = createGoalUseCases(deps);
  let started = false;

  const api: GoalApplicationPort = {
    // Goal CRUD / 目标增删改查
    createGoal: (input, cx) => useCases.createGoal.execute(input, cx),
    getGoal: (id, identityId, includeChildren) =>
      useCases.getGoal.execute(id, identityId, includeChildren),
    listGoals: (input) => useCases.listGoals.execute(input),
    updateGoal: (id, identityId, input) => useCases.updateGoal.execute(id, identityId, input),
    deleteGoal: (id, identityId, expectedVersion) =>
      useCases.deleteGoal.execute(id, identityId, expectedVersion),
    permanentlyDeleteGoal: (id, identityId, expectedVersion) =>
      useCases.permanentlyDeleteGoal.execute(id, identityId, expectedVersion),
    archiveGoal: (id, identityId, expectedVersion) =>
      useCases.archiveGoal.execute(id, identityId, expectedVersion),
    abandonGoal: (id, identityId, expectedVersion) =>
      useCases.abandonGoal.execute(id, identityId, expectedVersion),
    activateGoal: (id, identityId, expectedVersion) =>
      useCases.activateGoal.execute(id, identityId, expectedVersion),
    completeGoal: (id, identityId, expectedVersion) =>
      useCases.completeGoal.execute(id, identityId, expectedVersion),
    searchGoals: (identityId, query, systemView) =>
      useCases.searchGoals.execute(identityId, query, systemView as GoalSystemView),

    // Key Result / 关键结果
    addKeyResult: (goalId, identityId, keyResult) =>
      useCases.addKeyResult.execute(goalId, identityId, keyResult),
    updateKeyResult: (goalId, identityId, keyResultId, updates) =>
      useCases.updateKeyResult.execute(goalId, identityId, keyResultId, updates),
    updateKeyResultProgress: (
      goalId,
      identityId,
      keyResultId,
      currentValue,
      expectedVersion,
      note,
    ) =>
      useCases.updateKeyResultProgress.execute(
        goalId,
        identityId,
        keyResultId,
        currentValue,
        expectedVersion,
        note,
      ),
    deleteKeyResult: (goalId, identityId, keyResultId, expectedVersion) =>
      useCases.deleteKeyResult.execute(goalId, identityId, keyResultId, expectedVersion),

    // Review / 复盘
    addReview: (goalId, identityId, params) =>
      useCases.addReview.execute(goalId, identityId, params),
    listReviews: (goalId, identityId) => useCases.listReviews.execute(goalId, identityId),
    getReviewContext: (goalId, identityId, windowDays) =>
      useCases.getReviewContext.execute(goalId, identityId, windowDays),
    updateReview: (goalId, identityId, reviewId, params) =>
      useCases.updateReview.execute(goalId, identityId, reviewId, params),
    deleteReview: (goalId, identityId, reviewId, expectedVersion) =>
      useCases.deleteReview.execute(goalId, identityId, reviewId, expectedVersion),

    // Record / 进度记录
    createRecord: (goalId, keyResultId, params, identityId) =>
      useCases.createRecord.execute(goalId, keyResultId, params, identityId),
    updateRecord: (goalId, keyResultId, recordId, params, identityId) =>
      useCases.updateRecord.execute(goalId, keyResultId, recordId, params, identityId),
    listRecords: (params) => useCases.listRecords.execute(params),
    deleteRecord: (goalId, keyResultId, recordId, identityId, expectedVersion) =>
      useCases.deleteRecord.execute(goalId, keyResultId, recordId, identityId, expectedVersion),

    // Workflow / 工作流
    getGoalAggregate: (goalId, identityId) => useCases.getGoalAggregate.execute(goalId, identityId),
    cloneGoal: (goalId, params, cx) => useCases.cloneGoal.execute(goalId, params, cx),
    batchUpdateKeyResultWeights: (goalId, identityId, expectedVersion, updates) =>
      useCases.batchUpdateKeyResultWeights.execute(goalId, identityId, expectedVersion, updates),
  };

  return {
    goalRepository,
    goalRecordRepository,
    goalWriteTransactionRunner,
    useCases,
    api,

    start(): void {
      if (started) return;
      const startedContributions: GoalModuleRuntimeContribution[] = [];
      for (const runtime of runtimeContributions) {
        try {
          runtime.start();
          startedContributions.push(runtime);
        } catch (error) {
          // Partial-start rollback: stop the already-started contributions in
          // REVERSE order (best-effort, logged), then rethrow the ORIGINAL
          // error. `started` stays false, so a later dispose() is a no-op —
          // start() owns its partial-start cleanup.
          for (const startedRuntime of [...startedContributions].reverse()) {
            try {
              startedRuntime.stop();
            } catch (stopError) {
              logger.error(
                'GoalModule: contribution stop failed during partial-start rollback',
                stopError,
              );
            }
          }
          throw error;
        }
      }
      started = true;
    },

    dispose(): void {
      if (!started) return;
      for (const runtime of [...runtimeContributions].reverse()) {
        runtime.stop();
      }
      started = false;
    },
  };
}
