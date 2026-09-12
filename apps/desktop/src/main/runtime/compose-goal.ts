/**
 * Goal Electron composition root — desktop lane host runtime.
 * 目标 Electron 组合根 —— desktop lane 宿主运行时。
 *
 * This is the desktop-lane composition root for goal. The desktop main runtime
 * owns the per-profile PowerSync database (IElectronDatabase), so it selects the
 * PowerSync persistence adapters, builds the module-owned runtime contributions
 * (base contribution + event-listener wrapper), and assembles the
 * transport-neutral `GoalModuleInstance`. The instance is then bound to an
 * `IElectronModule`-compatible handle via `createGoalElectronModule`, and the
 * host-facing repository view is returned so dashboard/AI consumers read data
 * through explicit instance-bound ports.
 *
 * 这是目标在 desktop lane 的组合根。桌面主进程运行时拥有按 profile 划分的
 * PowerSync 数据库（IElectronDatabase），因此由它选择 PowerSync 持久化适配器、
 * 构建模块自有的运行时贡献（基础贡献 + 事件监听器包装），并装配与传输无关的
 * `GoalModuleInstance`。实例随后通过 `createGoalElectronModule` 绑定为兼容
 * `IElectronModule` 的 handle，同时返回宿主向 repository view，使 dashboard/AI
 * 消费者通过显式的 instance-bound port 读取数据。
 *
 * The same transport-neutral createGoalModule() / GoalApplicationPort is reused
 * with a PowerSync adapter only — this is the Electron counterpart of
 * apps/api/src/runtime/compose-goal.ts (plan §3.1), keeping HTTP/IPC parity:
 * both hosts swap only the persistence adapter, never the business logic. The
 * API lane composes Prisma repositories; the desktop lane composes PowerSync
 * repositories. PowerSync has no habit adapter, so `habitRepository` stays
 * undefined (GoalModuleDependencies.habitRepository is optional).
 *
 * 这里复用的是同一个 transport-neutral 的 createGoalModule() / GoalApplicationPort，
 * 只是换上了 PowerSync 适配器——这是 apps/api/src/runtime/compose-goal.ts 的
 * Electron 对应实现（计划 §3.1），以保持 HTTP/IPC 对齐：两个宿主只替换持久化
 * 适配器，不复制业务逻辑。API lane 组合 Prisma 仓储；desktop lane 组合
 * PowerSync 仓储。PowerSync 没有习惯适配器，因此 `habitRepository` 保持未提供
 * （GoalModuleDependencies.habitRepository 为可选）。
 *
 * Assembly order (plan §3.1, mirrored) — MUST be: runtime db → repositories →
 * module-owned runtime contributions + host contributions → goal instance →
 * Electron module. This keeps the dependency direction explicit: the host picks
 * adapters, the goal deep module stays transport-agnostic, and the returned
 * handle only registers transport + lifecycle.
 *
 * 组装顺序（镜像计划 §3.1）必须为：runtime db → repositories → 模块自有运行时
 * 贡献与宿主贡献 → goal instance → Electron module。这使依赖方向显式化：宿主
 * 选择适配器，goal 深模块保持与传输无关，返回的 handle 只负责 transport 注册
 * 与生命周期。
 *
 * Deliberately narrow interface: the host supplies the PowerSync database, the
 * already-created Task→Goal binding read port, and optional extra runtime
 * contributions. It does NOT pass unused transport objects or storage paths —
 * unused capabilities add implicit ordering and test burden.
 *
 * 刻意保持窄接口：宿主提供 PowerSync 数据库、已创建的 Task→Goal 绑定读取端口
 * 与可选额外运行时贡献。不接收未使用的 transport 对象或存储路径——未使用的能力
 * 只会带来隐含顺序与测试负担。
 */

import type { IElectronDatabase } from '@memoflow/contracts/electron';
import {
  createGoalEventListenersRuntime,
  createGoalModule,
  createGoalPowerSyncRepositories,
  createGoalPowerSyncDeletionTransactionRunner,
  createGoalRuntimeContribution,
  normalizeGoalRuntimeContributions,
  type GoalApplicationPort,
  type GoalRuntimeContributionsInput,
  type PowerSyncGoalRelationCleanupFactory,
  type IGoalRecordRepository,
  type IGoalRepository,
} from '@memoflow/goal';
import { createGoalElectronModule, type GoalElectronModuleDef } from '@memoflow/goal/electron';
import type { GoalDependencyReadPort } from '@memoflow/contracts/reliable-messaging';
import type { UserTimeContextPort } from '@memoflow/time';

/**
 * Dependencies the goal composer needs from the desktop host runtime.
 * 目标 composer 需要从 desktop 宿主运行时拿到的依赖。
 */
export interface ComposeGoalDependencies {
  /** PowerSync-backed desktop business database owned by the desktop main runtime. 桌面主进程持有的 PowerSync 桌面业务数据库。 */
  readonly db: IElectronDatabase;
  /** Host-provided Task→Goal dependency read port (PowerSyncTaskBindingReadPort). 宿主提供的 Task→Goal 依赖读取端口。 */
  readonly taskBindingReadPort: GoalDependencyReadPort;
  readonly userTimeContextPort: UserTimeContextPort;
  /** Shared Relation transaction-scoped cleanup adapter. */
  readonly relationCleanupFactory: PowerSyncGoalRelationCleanupFactory;
  /** Extra runtime contributions from the host (e.g. schedule projection). 宿主提供的额外运行时贡献。 */
  readonly runtimeContributions?: GoalRuntimeContributionsInput;
}

/**
 * Composed goal Electron module handle plus the instance-bound repository view.
 * 组装好的目标 Electron module handle 以及 instance-bound repository view。
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
export interface ComposeGoalResult {
  /** Already-bound IElectronModule-compatible handle. 已绑定的兼容 IElectronModule 的 handle。 */
  readonly module: GoalElectronModuleDef;
  /** Canonical transport-neutral application port from the SAME module instance. */
  readonly applicationPort: GoalApplicationPort;
  /** Instance-bound repository view for desktop consumers (dashboard/AI). 供 desktop 消费者（dashboard/AI）使用的 instance-bound repository view。 */
  readonly repositories: {
    readonly goalRepository: IGoalRepository;
    readonly goalRecordRepository: IGoalRecordRepository;
  };
}

/**
 * Composes the goal Electron module handle from the desktop runtime's database.
 * 用 desktop runtime 的数据库组装目标 Electron module handle。
 *
 * Wire order:
 * 1. createGoalPowerSyncRepositories(db) — select the PowerSync adapters.
 * 2. createGoalEventListenersRuntime(...) + createGoalRuntimeContribution()
 *    — build the module-owned runtime contributions (base contribution first,
 *    then the listener wrapper, then host contributions).
 * 3. createGoalModule({ ...repositories, taskBindingReadPort, runtimeContributions })
 *    — assemble the transport-neutral goal instance.
 * 4. createGoalElectronModule({ instance }) — bind the instance to an
 *    IElectronModule handle (transport + lifecycle only).
 *
 * 接线顺序：
 * 1. createGoalPowerSyncRepositories(db) —— 选择 PowerSync 适配器。
 * 2. createGoalEventListenersRuntime(...) 与 createGoalRuntimeContribution()
 *    —— 构建模块自有运行时贡献（先基础贡献，再 listener 包装，再宿主贡献）。
 * 3. createGoalModule({ ...repositories, taskBindingReadPort, runtimeContributions })
 *    —— 装配与传输无关的目标实例。
 * 4. createGoalElectronModule({ instance }) —— 把实例绑定到 IElectronModule
 *    handle（只负责 transport 与生命周期）。
 *
 * The returned handle is already fully bound: ElectronBootstrapper.register()
 * must be called with it once, and its destroy() disposes the owned instance.
 * The returned repository view stays valid for the lifetime of that handle.
 *
 * 返回的 handle 已完全绑定：ElectronBootstrapper.register() 必须恰好注册一次，
 * 其 destroy() 会 dispose 所属实例。返回的 repository view 在该 handle 存续期间
 * 始终有效。
 *
 * @param dependencies - ComposeGoalDependencies with the runtime Electron database.
 * @returns ComposeGoalResult — the bound Electron module handle plus repository view.
 */
export function composeGoal(dependencies: ComposeGoalDependencies): ComposeGoalResult {
  const { goalRepository, goalRecordRepository, goalWriteTransactionRunner } =
    createGoalPowerSyncRepositories(dependencies.db);

  const listenerRuntime = createGoalEventListenersRuntime({
    goalRepository,
    goalRecordRepository,
    goalWriteTransactionRunner,
  });

  const runtimeContributions = [
    createGoalRuntimeContribution(),
    listenerRuntime,
    ...normalizeGoalRuntimeContributions(dependencies.runtimeContributions),
  ];

  const instance = createGoalModule({
    goalRepository,
    goalRecordRepository,
    goalWriteTransactionRunner,
    goalDeletionTransactionRunner: createGoalPowerSyncDeletionTransactionRunner(
      dependencies.db,
      dependencies.relationCleanupFactory,
    ),
    taskBindingReadPort: dependencies.taskBindingReadPort,
    userTimeContextPort: dependencies.userTimeContextPort,
    runtimeContributions,
  });

  return {
    module: createGoalElectronModule({ instance }),
    applicationPort: instance.api,
    repositories: {
      goalRepository,
      goalRecordRepository,
    },
  };
}
