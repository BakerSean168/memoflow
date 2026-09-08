/**
 * Task Electron composition root — desktop lane host runtime.
 * 任务 Electron 组合根 —— desktop lane 宿主运行时。
 *
 * This is the desktop-lane composition root for task. The desktop main runtime
 * owns the per-profile PowerSync database (IElectronDatabase), so it selects the
 * PowerSync persistence adapters, builds the module-owned runtime contributions
 * (base contribution + conditional Task→Goal outbox runtime), appends host
 * contributions (schedule projection runtime), and assembles the
 * transport-neutral `TaskModuleInstance`. The instance is then bound to an
 * `IElectronModule`-compatible handle via `createTaskElectronModule`, and the
 * host-facing repository view is returned so dashboard/AI consumers read data
 * through explicit instance-bound ports.
 *
 * 这是任务在 desktop lane 的组合根。桌面主进程运行时拥有按 profile 划分的
 * PowerSync 数据库（IElectronDatabase），因此由它选择 PowerSync 持久化适配器、
 * 构建模块自有的运行时贡献（基础贡献 + 条件性的 Task→Goal outbox runtime）、
 * 追加宿主贡献（schedule projection runtime），并装配与传输无关的
 * `TaskModuleInstance`。实例随后通过 `createTaskElectronModule` 绑定为兼容
 * `IElectronModule` 的 handle，同时返回宿主向 repository view，使 dashboard/AI
 * 消费者通过显式的 instance-bound port 读取数据。
 *
 * The same transport-neutral createTaskModule() / TaskApplicationPort is reused
 * with a PowerSync adapter only — this is the Electron counterpart of
 * apps/api/src/runtime/compose-task.ts (plan §3.1), keeping HTTP/IPC parity:
 * both hosts swap only the persistence adapter, never the business logic. The
 * API lane composes Prisma repositories; the desktop lane composes PowerSync
 * repositories.
 *
 * 这里复用的是同一个 transport-neutral 的 createTaskModule() / TaskApplicationPort，
 * 只是换上了 PowerSync 适配器——这是 apps/api/src/runtime/compose-task.ts 的
 * Electron 对应实现（计划 §3.1），以保持 HTTP/IPC 对齐：两个宿主只替换持久化
 * 适配器，不复制业务逻辑。API lane 组合 Prisma 仓储；desktop lane 组合
 * PowerSync 仓储。
 *
 * The Task→Goal outbox runtime is enabled only when the host supplies
 * `goalProgressHandler` (created via createGoalTaskProgressPowerSyncHandler).
 * When absent, no outbox poller is constructed — matching the historical
 * electron entry behavior exactly.
 *
 * Task→Goal outbox runtime 仅在宿主提供 `goalProgressHandler`
 * （由 createGoalTaskProgressPowerSyncHandler 创建）时启用；缺省时不构造
 * outbox 轮询器——与历史 electron 入口行为完全一致。
 *
 * Assembly order (plan §3.1, mirrored) — MUST be: runtime db → repositories →
 * createTaskRuntimeContribution() → (conditional) outbox runtime → host
 * contributions → task instance → Electron module. This keeps the dependency
 * direction explicit: the host picks adapters, the task deep module stays
 * transport-agnostic, and the returned handle only registers transport +
 * lifecycle.
 *
 * 组装顺序（镜像计划 §3.1）必须为：runtime db → repositories →
 * createTaskRuntimeContribution() →（条件性）outbox runtime → 宿主贡献 →
 * task instance → Electron module。这使依赖方向显式化：宿主选择适配器，
 * task 深模块保持与传输无关，返回的 handle 只负责 transport 注册与生命周期。
 *
 * Deliberately narrow interface: the host supplies the PowerSync database,
 * optional extra runtime contributions, and the optional goal progress handler.
 * It does NOT pass unused transport objects.
 *
 * 刻意保持窄接口：宿主提供 PowerSync 数据库、可选额外运行时贡献与可选
 * goal progress handler。不接收未使用的 transport 对象。
 */

import type { IElectronDatabase } from '@memoflow/contracts/electron';
import {
  createTaskModule,
  createTaskPowerSyncGoalOutboxRuntime,
  createTaskPowerSyncRepositories,
  createTaskRuntimeContribution,
  normalizeTaskRuntimeContributions,
  type TaskApplicationPort,
  type ITaskOccurrenceRepository,
  type ITaskPlanRepository,
  type TaskRuntimeContributionsInput,
} from '@memoflow/task';
import { createTaskElectronModule, type TaskElectronModuleDef } from '@memoflow/task/electron';
import type { TaskGoalProgressHandler } from '@memoflow/goal';

/**
 * Dependencies the task composer needs from the desktop host runtime.
 * 任务 composer 需要从 desktop 宿主运行时拿到的依赖。
 */
export interface ComposeTaskDependencies {
  /** PowerSync-backed desktop business database owned by the desktop main runtime. 桌面主进程持有的 PowerSync 桌面业务数据库。 */
  readonly db: IElectronDatabase;
  /** Extra runtime contributions from the host (e.g. schedule projection). 宿主提供的额外运行时贡献。 */
  readonly runtimeContributions?: TaskRuntimeContributionsInput;
  /** Goal's durable Task→Goal progress handler; enables the outbox runtime when present. 目标侧持久 Task→Goal 进度处理器；提供时启用 outbox runtime。 */
  readonly goalProgressHandler?: TaskGoalProgressHandler;
}

/**
 * Composed task Electron module handle plus the instance-bound repository view.
 * 组装好的任务 Electron module handle 以及 instance-bound repository view。
 *
 * The module is the IElectronModule-compatible handle to register once; the
 * repositories are the exact instances the module owns, exposed so desktop
 * consumers (dashboard/AI) read through explicit ports instead of package
 * globals.
 *
 * module 是需要恰好注册一次的、兼容 IElectronModule 的 handle；repositories 是
 * 模块拥有的确切实例，暴露给 desktop 消费者（dashboard/AI），使其通过显式 port
 * 读取数据，而不是依赖包级全局变量。
 */
export interface ComposeTaskResult {
  /** Already-bound IElectronModule-compatible handle. 已绑定的兼容 IElectronModule 的 handle。 */
  readonly module: TaskElectronModuleDef;
  /** Canonical transport-neutral application port from the SAME module instance. */
  readonly applicationPort: TaskApplicationPort;
  /** Instance-bound repository view for desktop consumers (dashboard/AI). 供 desktop 消费者（dashboard/AI）使用的 instance-bound repository view。 */
  readonly repositories: {
    readonly taskPlanRepository: ITaskPlanRepository;
    readonly taskOccurrenceRepository: ITaskOccurrenceRepository;
  };
}

/**
 * Composes the task Electron module handle from the desktop runtime's database.
 * 用 desktop runtime 的数据库组装任务 Electron module handle。
 *
 * Wire order:
 * 1. createTaskPowerSyncRepositories(db) — select the PowerSync adapters.
 * 2. createTaskRuntimeContribution() — build the base module runtime.
 * 3. When goalProgressHandler is present: createTaskPowerSyncGoalOutboxRuntime(db,
 *    goalProgressHandler) — build the durable PowerSync-backed Task→Goal outbox
 *    poller (dispatcher/store construction stays inside the task package).
 * 4. Append host runtime contributions (schedule projection runtime).
 * 5. createTaskModule({ ...repositories, runtimeContributions }) — assemble the
 *    transport-neutral task instance (maintenance runtime is prepended inside).
 * 6. createTaskElectronModule({ instance }) — bind the instance to an
 *    IElectronModule handle (transport + lifecycle only).
 *
 * 接线顺序：
 * 1. createTaskPowerSyncRepositories(db) —— 选择 PowerSync 适配器。
 * 2. createTaskRuntimeContribution() —— 构建基础模块运行时。
 * 3. 当提供 goalProgressHandler 时：createTaskPowerSyncGoalOutboxRuntime(db,
 *    goalProgressHandler) —— 构建可靠的 PowerSync 版 Task→Goal outbox 轮询器
 *    （dispatcher/store 构造留在 task 包内）。
 * 4. 追加宿主运行时贡献（schedule projection runtime）。
 * 5. createTaskModule({ ...repositories, runtimeContributions }) —— 装配与传输
 *    无关的任务实例（maintenance runtime 在模块内部前置）。
 * 6. createTaskElectronModule({ instance }) —— 把实例绑定到 IElectronModule
 *    handle（只负责 transport 与生命周期）。
 *
 * The returned handle is already fully bound: ElectronBootstrapper.register()
 * must be called with it once (Task register is async and awaited by the
 * bootstrapper), and its destroy() disposes the owned instance. The returned
 * repository view stays valid for the lifetime of that handle.
 *
 * 返回的 handle 已完全绑定：ElectronBootstrapper.register() 必须恰好注册一次
 * （Task register 是异步的并会被 bootstrapper await），其 destroy() 会 dispose
 * 所属实例。返回的 repository view 在该 handle 存续期间始终有效。
 *
 * @param dependencies - ComposeTaskDependencies with the runtime Electron database.
 * @returns ComposeTaskResult — the bound Electron module handle plus repository view.
 */
export function composeTask(dependencies: ComposeTaskDependencies): ComposeTaskResult {
  const {
    taskPlanRepository,
    taskOccurrenceRepository,
    taskWriteTransactionRunner,
  } = createTaskPowerSyncRepositories(dependencies.db);

  const runtimeContributions = [
    createTaskRuntimeContribution(),
    ...(dependencies.goalProgressHandler
      ? [createTaskPowerSyncGoalOutboxRuntime(dependencies.db, dependencies.goalProgressHandler)]
      : []),
    ...normalizeTaskRuntimeContributions(dependencies.runtimeContributions),
  ];

  const instance = createTaskModule({
    taskPlanRepository,
    taskOccurrenceRepository,
    taskWriteTransactionRunner,
    runtimeContributions,
  });

  return {
    module: createTaskElectronModule({ instance }),
    applicationPort: instance.api,
    repositories: {
      taskPlanRepository,
      taskOccurrenceRepository,
    },
  };
}
