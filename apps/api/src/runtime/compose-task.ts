/**
 * Task API composition root — API lane host runtime.
 * 任务 API 组合根 —— API lane 宿主运行时。
 *
 * This is the API-lane composition root for task. The API runtime owns the
 * shared Prisma connection (created in main.ts by connectDatabase()), so it
 * selects the Prisma persistence adapters, builds the module-owned runtime
 * contributions (base contribution + conditional Task→Goal outbox runtime),
 * appends host contributions (schedule projection runtime), and assembles the
 * transport-neutral `TaskModuleInstance`. The instance is then bound to an
 * `IApiModule`-compatible handle via `createTaskApiModule`.
 *
 * 这是任务在 API lane 的组合根。API runtime 拥有共享的 Prisma 连接
 * （由 main.ts 的 connectDatabase() 创建），因此由它选择 Prisma 持久化适配器、
 * 构建模块自有的运行时贡献（基础贡献 + 条件性的 Task→Goal outbox runtime）、
 * 追加宿主贡献（schedule projection runtime），并装配与传输无关的
 * `TaskModuleInstance`。实例随后通过 `createTaskApiModule` 绑定为兼容
 * `IApiModule` 的 handle。
 *
 * Assembly order (plan §3.1) — MUST be: runtime db → repositories →
 * createTaskRuntimeContribution() → (conditional) outbox runtime → host
 * contributions → task instance → API module. This keeps the dependency
 * direction explicit: the host picks adapters, the task deep module stays
 * transport-agnostic, and the returned handle only registers transport +
 * lifecycle.
 *
 * 组装顺序（计划 §3.1）必须为：runtime db → repositories →
 * createTaskRuntimeContribution() →（条件性）outbox runtime → 宿主贡献 →
 * task instance → API module。这使依赖方向显式化：宿主选择适配器，
 * task 深模块保持与传输无关，返回的 handle 只负责 transport 注册与生命周期。
 *
 * The Task→Goal outbox runtime is enabled only when the host supplies
 * `goalProgressHandler` (created via createGoalTaskProgressPrismaHandler). When
 * absent, no outbox poller is constructed — matching the historical
 * api/module.ts behavior exactly.
 *
 * Task→Goal outbox runtime 仅在宿主提供 `goalProgressHandler`
 * （由 createGoalTaskProgressPrismaHandler 创建）时启用；缺省时不构造
 * outbox 轮询器——与历史 api/module.ts 行为完全一致。
 *
 * Deliberately narrow interface: the host supplies the shared Prisma client,
 * optional extra runtime contributions, and the optional goal progress handler.
 * It does NOT pass a route prefix (dead option, removed in Step 2) or unused
 * transport objects.
 *
 * 刻意保持窄接口：宿主提供共享 Prisma client、可选额外运行时贡献与可选
 * goal progress handler。不接收 route prefix（Step 2 已移除的死选项）或
 * 未使用的 transport 对象。
 */

import type { PrismaClient } from '@memoflow/database';
import {
  createTaskModule,
  createTaskPrismaGoalOutboxRuntime,
  createTaskPrismaRepositories,
  createTaskRuntimeContribution,
  normalizeTaskRuntimeContributions,
  type ITaskOccurrenceRepository,
  type ITaskPlanRepository,
  type TaskApplicationPort,
  type TaskRuntimeContributionsInput,
} from '@memoflow/task';
import {
  createTaskApiModule,
  type TaskApiModuleDef,
} from '@memoflow/task/api';
import type { TaskGoalProgressHandler } from '@memoflow/goal';

/**
 * Dependencies the task composer needs from the API host runtime.
 * 任务 composer 需要从 API 宿主运行时拿到的依赖。
 */
export interface ComposeTaskDependencies {
  /** Shared API-lane Prisma client owned by apps/api. 由 apps/api 持有的共享 API lane Prisma client。 */
  readonly db: PrismaClient;
  /** Extra runtime contributions from the host (e.g. schedule projection). 宿主提供的额外运行时贡献。 */
  readonly runtimeContributions?: TaskRuntimeContributionsInput;
  /** Goal's durable Task→Goal progress handler; enables the outbox runtime when present. 目标侧持久 Task→Goal 进度处理器；提供时启用 outbox runtime。 */
  readonly goalProgressHandler?: TaskGoalProgressHandler;
}

/**
 * Composed task surface for the API host.
 * 任务在 API 宿主的组装结果。
 */
export interface ComposedTask {
  /** Already-bound IApiModule-compatible handle (transport + lifecycle only). 已绑定的 IApiModule 兼容 handle（只负责 transport 与生命周期）。 */
  readonly module: TaskApiModuleDef;
  /** The transport-neutral application port (`instance.api`) for sibling modules to orchestrate. 供兄弟模块编排的与传输无关 application port（`instance.api`）。 */
  readonly applicationPort: TaskApplicationPort;
  /** Task instance repository for scheduled-handler registration (task.reminder.fire). 供 scheduled handler 注册（task.reminder.fire）使用的任务实例仓储。 */
  readonly taskOccurrenceRepository: ITaskOccurrenceRepository;
  /** Task template repository for scheduled-handler registration (task.reminder.fire). 供 scheduled handler 注册（task.reminder.fire）使用的任务模板仓储。 */
  readonly taskPlanRepository: ITaskPlanRepository;
}

/**
 * Composes the task API module handle from the API runtime's Prisma client.
 * 用 API runtime 的 Prisma client 组装任务 API module handle。
 *
 * Wire order:
 * 1. createTaskPrismaRepositories(db) — select the Prisma adapters.
 * 2. createTaskRuntimeContribution() — build the base module runtime.
 * 3. When goalProgressHandler is present: createTaskPrismaGoalOutboxRuntime(db,
 *    goalProgressHandler) — build the durable Prisma-backed Task→Goal outbox
 *    poller (dispatcher/store construction stays inside the task package).
 * 4. Append host runtime contributions (schedule projection runtime).
 * 5. createTaskModule({ ...repositories, runtimeContributions }) — assemble the
 *    transport-neutral task instance (maintenance runtime is prepended inside).
 * 6. createTaskApiModule({ instance }) — bind the instance to an IApiModule
 *    handle (transport + lifecycle only).
 *
 * 接线顺序：
 * 1. createTaskPrismaRepositories(db) —— 选择 Prisma 适配器。
 * 2. createTaskRuntimeContribution() —— 构建基础模块运行时。
 * 3. 当提供 goalProgressHandler 时：createTaskPrismaGoalOutboxRuntime(db,
 *    goalProgressHandler) —— 构建可靠的 Prisma 版 Task→Goal outbox 轮询器
 *    （dispatcher/store 构造留在 task 包内）。
 * 4. 追加宿主运行时贡献（schedule projection runtime）。
 * 5. createTaskModule({ ...repositories, runtimeContributions }) —— 装配与传输
 *    无关的任务实例（maintenance runtime 在模块内部前置）。
 * 6. createTaskApiModule({ instance }) —— 把实例绑定到 IApiModule handle
 *    （只负责 transport 与生命周期）。
 *
 * The returned handle is already fully bound: ApiBootstrapper.register() must
 * be called with it once (Task register is async and awaited), and its destroy()
 * disposes the owned instance.
 *
 * 返回的 handle 已完全绑定：ApiBootstrapper.register() 必须恰好注册一次
 * （Task register 是异步的并会被 await），其 destroy() 会 dispose 所属实例。
 *
 * @param dependencies - ComposeTaskDependencies with the runtime Prisma client.
 * @returns ComposedTask — the bound module handle and the shared application port.
 */
export function composeTask(
  dependencies: ComposeTaskDependencies,
): ComposedTask {
  const {
    taskPlanRepository,
    taskOccurrenceRepository,
    taskWriteTransactionRunner,
  } = createTaskPrismaRepositories(dependencies.db);

  const runtimeContributions = [
    createTaskRuntimeContribution(),
    ...(dependencies.goalProgressHandler
      ? [
          createTaskPrismaGoalOutboxRuntime(
            dependencies.db,
            dependencies.goalProgressHandler,
          ),
        ]
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
    module: createTaskApiModule({ instance }),
    applicationPort: instance.api,
    taskOccurrenceRepository,
    taskPlanRepository,
  };
}
