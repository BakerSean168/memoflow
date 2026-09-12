/**
 * Goal API composition root — API lane host runtime.
 * 目标 API 组合根 —— API lane 宿主运行时。
 *
 * This is the API-lane composition root for goal. The API runtime owns the
 * shared Prisma connection (created in main.ts by connectDatabase()), so it
 * selects the Prisma persistence adapters, builds the module-owned runtime
 * contributions (base contribution + event-listener wrapper), and assembles
 * the transport-neutral `GoalModuleInstance`. The instance is then bound to an
 * `IApiModule`-compatible handle via `createGoalApiModule`.
 *
 * 这是目标在 API lane 的组合根。API runtime 拥有共享的 Prisma 连接
 * （由 main.ts 的 connectDatabase() 创建），因此由它选择 Prisma 持久化适配器、
 * 构建模块自有的运行时贡献（基础贡献 + 事件监听器包装），并装配与传输无关的
 * `GoalModuleInstance`。实例随后通过 `createGoalApiModule` 绑定为兼容
 * `IApiModule` 的 handle。
 *
 * Assembly order (plan §3.1) — MUST be: runtime db → repositories →
 * module-owned runtime contributions + host contributions → goal instance →
 * API module. This keeps the dependency direction explicit: the host picks
 * adapters, the goal deep module stays transport-agnostic, and the returned
 * handle only registers transport + lifecycle.
 *
 * 组装顺序（计划 §3.1）必须为：runtime db → repositories → 模块自有运行时贡献
 * 与宿主贡献 → goal instance → API module。这使依赖方向显式化：宿主选择适配器，
 * goal 深模块保持与传输无关，返回的 handle 只负责 transport 注册与生命周期。
 *
 * Deliberately narrow interface: the host supplies the shared Prisma client, the
 * already-created Task→Goal binding read port, and optional extra runtime
 * contributions. It does NOT pass auth/account capabilities, storage dirs, or
 * unused transport objects — unused capabilities add implicit ordering and test
 * burden.
 *
 * 刻意保持窄接口：宿主提供共享 Prisma client、已创建的 Task→Goal 绑定读取端口
 * 与可选额外运行时贡献。不接收 auth/account 能力、存储目录或未使用的 transport
 * 对象——未使用的能力只会带来隐含顺序与测试负担。
 */

import type { PrismaClient } from '@memoflow/database';
import {
  createGoalEventListenersRuntime,
  createGoalModule,
  createGoalPrismaRepositories,
  createGoalPrismaDeletionTransactionRunner,
  createGoalRuntimeContribution,
  normalizeGoalRuntimeContributions,
  type GoalApplicationPort,
  type GoalRuntimeContributionsInput,
  type IGoalRecordRepository,
  type IGoalRepository,
  type PrismaGoalRelationCleanupFactory,
} from '@memoflow/goal';
import { createGoalApiModule, type GoalApiModuleDef } from '@memoflow/goal/api';
import type { GoalDependencyReadPort } from '@memoflow/contracts/reliable-messaging';
import type { UserTimeContextPort } from '@memoflow/time';

/**
 * Dependencies the goal composer needs from the API host runtime.
 * 目标 composer 需要从 API 宿主运行时拿到的依赖。
 */
export interface ComposeGoalDependencies {
  /** Shared API-lane Prisma client owned by apps/api. 由 apps/api 持有的共享 API lane Prisma client。 */
  readonly db: PrismaClient;
  /** Host-provided Task→Goal dependency read port (PrismaTaskBindingReadPort). 宿主提供的 Task→Goal 依赖读取端口。 */
  readonly taskBindingReadPort: GoalDependencyReadPort;
  /** Canonical identity-scoped Product Time context; required because Prisma enables Habit. */
  readonly userTimeContextPort: UserTimeContextPort;
  /** Shared Relation transaction-scoped cleanup adapter. */
  readonly relationCleanupFactory: PrismaGoalRelationCleanupFactory;
  /** Extra runtime contributions from the host (e.g. schedule projection). 宿主提供的额外运行时贡献。 */
  readonly runtimeContributions?: GoalRuntimeContributionsInput;
}

/**
 * Composed goal surface for the API host.
 * 目标在 API 宿主的组装结果。
 */
export interface ComposedGoal {
  /** Already-bound IApiModule-compatible handle (transport + lifecycle only). 已绑定的 IApiModule 兼容 handle（只负责 transport 与生命周期）。 */
  readonly module: GoalApiModuleDef;
  /** The transport-neutral application port (`instance.api`) for sibling modules to orchestrate. 供兄弟模块编排的与传输无关 application port（`instance.api`）。 */
  readonly applicationPort: GoalApplicationPort;
  /** Exact instance-bound owner repositories for host read-composition adapters. */
  readonly repositories: {
    readonly goalRepository: IGoalRepository;
    readonly goalRecordRepository: IGoalRecordRepository;
  };
}

/**
 * Composes the goal API module handle from the API runtime's Prisma client.
 * 用 API runtime 的 Prisma client 组装目标 API module handle。
 *
 * Wire order:
 * 1. createGoalPrismaRepositories(db) — select the Prisma adapters.
 * 2. createGoalEventListenersRuntime(...) + createGoalRuntimeContribution()
 *    — build the module-owned runtime contributions (base contribution first,
 *    then the listener wrapper, then host contributions).
 * 3. createGoalModule({ ...repositories, taskBindingReadPort, runtimeContributions })
 *    — assemble the transport-neutral goal instance.
 * 4. createGoalApiModule({ instance }) — bind the instance to an
 *    IApiModule handle (transport + lifecycle only).
 *
 * 接线顺序：
 * 1. createGoalPrismaRepositories(db) —— 选择 Prisma 适配器。
 * 2. createGoalEventListenersRuntime(...) 与 createGoalRuntimeContribution()
 *    —— 构建模块自有运行时贡献（先基础贡献，再 listener 包装，再宿主贡献）。
 * 3. createGoalModule({ ...repositories, taskBindingReadPort, runtimeContributions })
 *    —— 装配与传输无关的目标实例。
 * 4. createGoalApiModule({ instance }) —— 把实例绑定到 IApiModule handle
 *    （只负责 transport 与生命周期）。
 *
 * The returned handle is already fully bound: ApiBootstrapper.register() must
 * be called with it once, and its destroy() disposes the owned instance.
 *
 * 返回的 handle 已完全绑定：ApiBootstrapper.register() 必须恰好注册一次，
 * 其 destroy() 会 dispose 所属实例。
 *
 * @param dependencies - ComposeGoalDependencies with the runtime Prisma client.
 * @returns ComposedGoal — the bound module handle and the shared application port.
 */
export function composeGoal(dependencies: ComposeGoalDependencies): ComposedGoal {
  const {
    goalRepository,
    goalRecordRepository,
    goalWriteTransactionRunner,
    habitRepository,
    walletRepository,
  } = createGoalPrismaRepositories(dependencies.db);

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
    goalDeletionTransactionRunner: createGoalPrismaDeletionTransactionRunner(
      dependencies.db,
      dependencies.relationCleanupFactory,
    ),
    habitRepository,
    walletRepository,
    taskBindingReadPort: dependencies.taskBindingReadPort,
    userTimeContextPort: dependencies.userTimeContextPort,
    runtimeContributions,
  });

  return {
    module: createGoalApiModule({ instance }),
    applicationPort: instance.api,
    repositories: { goalRepository, goalRecordRepository },
  };
}
