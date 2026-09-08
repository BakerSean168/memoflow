/**
 * Task API Transport Module Factory
 * 任务 API 传输模块工厂
 *
 * This module is a transport adapter, NOT a composition root:
 * it only wires an already-assembled `TaskModuleInstance` onto the Express
 * router and owns that instance's start/dispose lifecycle.
 *
 * 本模块是传输适配器，而不是组合根：
 * 它只负责把已装配好的 `TaskModuleInstance` 挂到 Express 路由上，
 * 并托管该实例的 start/dispose 生命周期。
 *
 * The host (apps/api) is responsible for composition: it selects the Prisma
 * adapters, builds repositories, runtime contributions (including the outbox
 * runtime when a goal-progress handler is supplied) and the schedule
 * projection runtime, calls `createTaskModule(...)`, and passes the resulting
 * instance in through `TaskApiModuleOptions`. This factory never reads
 * `context.db`, never constructs repositories/use cases, and never starts a
 * runtime adapter.
 *
 * 宿主（apps/api）负责组合：选择 Prisma 适配器、构建 repository、
 * runtime contribution（提供 goal-progress handler 时含 outbox runtime）
 * 与 schedule projection runtime、调用 `createTaskModule(...)`，再把组装结果
 * 通过 `TaskApiModuleOptions` 传入。本工厂不读取 `context.db`，
 * 不创建 repository/use case，也不启动任何 runtime adapter。
 *
 * `instance.api` is the HTTP/IPC-shared application seam
 * (`TaskApplicationPort`). Both the API transport (this module) and the
 * Electron IPC transport consume the same port, so behaviour parity across
 * hosts is guaranteed by construction.
 *
 * `instance.api` 是 HTTP/IPC 共用的应用 seam（`TaskApplicationPort`）。
 * API 传输层（本模块）与 Electron IPC 传输层消费同一个 port，
 * 从而从构造上保证跨宿主行为一致。
 *
 * Per-handle state machine (`created -> registered | failed`, then any state
 * -> `disposed`):
 * - register(): only allowed from `created`. Builds controllers from
 *   `instance.api` and the fixed routes (`/task-plans`,
 *   `/task-occurrences`) via `registerTaskRoutes`, AWAITS
 *   `instance.start()`, and ONLY THEN mounts the combined router — a failed
 *   start happens before any `router.use(...)` call, so the host router never
 *   observes a route for a handle that did not start (no rollback/unmount is
 *   needed). On success the handle moves to `registered`; a second register()
 *   throws. On any failure it cleans up (best-effort await of dispose, logged
 *   if dispose itself throws), moves to `failed`, and rethrows the ORIGINAL
 *   error. A failed handle must not be re-registered.
 * - destroy(): always allowed and always idempotent. A handle in `failed` is
 *   a terminal no-op too: the instance was already disposed in the register()
 *   failure path. For a live handle the state is set to `disposed` BEFORE
 *   `await instance.dispose()` runs, so a reentrant/retry destroy stays a no-op
 *   even if dispose throws (destroy may propagate that error).
 *
 * 每个 handle 的状态机（`created -> registered | failed`，之后任意状态 ->
 * `disposed`）：
 * - register()：仅允许从 `created` 进入。用 `instance.api` 构建控制器并通过
 *   `registerTaskRoutes` 挂载固定路由（`/task-plans`、`/task-occurrences`、
 *   `/tasks`），await `instance.start()`，之后才挂载组合 router——start 失败
 *   发生在任何 `router.use(...)` 之前，因此宿主 router 永远不会看到一个
 *   未启动成功 handle 的路由（无需回滚/卸载）。成功则进入 `registered`，
 *   重复 register() 抛错；任何失败先清理（best-effort await dispose，
 *   若 dispose 自身抛错则记录日志），进入 `failed` 并重新抛出原始错误。
 *   failed 的 handle 不得再次注册。
 * - destroy()：任何状态都允许，且始终幂等。处于 `failed` 的 handle 也是
 *   终态 no-op——其实例已在 register() 的失败路径中 dispose。对存活 handle，
 *   在 `await instance.dispose()` 执行前先把状态置为 `disposed`，因此即使
 *   dispose 抛错（该错误可向外传播），重入/重试 destroy 仍为 no-op。
 *
 * The instance is owned by the factory closure, not by a package-level
 * singleton. Re-registering the returned module handle does not create a second
 * instance; the explicit state machine above is per-handle state.
 *
 * 实例由工厂闭包持有，而不是包级 singleton。重复注册返回的 module handle
 * 不会创建第二个实例；上述显式状态机即每个 handle 自己的状态。
 */

import type { ServerModuleHandle, ServerTransportModuleContext } from '@memoflow/contracts/shared';
import { createLogger } from '@memoflow/utils/logger';
import type { TaskModuleInstance } from '../server/infrastructure';
import { createTaskTransportHandlers } from '../server/transport';
import { TaskOccurrenceController } from '../server/transport/task-occurrence.controller';
import { TaskPlanController } from '../server/transport/task-plan.controller';
import { registerTaskRoutes } from './routes';

const logger = createLogger('TaskApi');

/**
 * Per-handle lifecycle state. Only 'created' may enter 'registered' (or
 * 'failed' on a registration error); any state may end in 'disposed'.
 *
 * 每个 handle 的生命周期状态。只有 'created' 可以进入 'registered'
 * （或注册失败时进入 'failed'）；任意状态都可以结束于 'disposed'。
 */
type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

/**
 * Transport-only context for 任务 registration — reuses the canonical
 * shared `ServerTransportModuleContext`. Deliberately carries no `db`, so
 * this seam can never become a second composition root.
 *
 * 任务注册的传输专用上下文——复用规范的共享 `ServerTransportModuleContext`。
 * 刻意不包含 `db`，该 seam 绝不可能是第二个组合根。
 */
export type TaskApiModuleContext = ServerTransportModuleContext;

/**
 * Task API module handle extending the shared lifecycle contract.
 * Task API 模块 handle，继承共享生命周期契约。
 */
export interface TaskApiModuleDef extends ServerModuleHandle<TaskApiModuleContext> {}

/**
 * Options for `createTaskApiModule`.
 * `createTaskApiModule` 的选项。
 */
export interface TaskApiModuleOptions {
  readonly instance: TaskModuleInstance;
}

/**
 * Creates the task API transport module handle.
 * 创建任务 API 传输模块 handle。
 *
 * Turns an already-assembled `TaskModuleInstance` into an
 * `IApiModule`-compatible handle. The handle is a transport adapter, not a
 * composition root: it only registers routes and owns start/dispose lifecycle.
 *
 * 把已装配的 `TaskModuleInstance` 变成兼容 `IApiModule` 的 handle。
 * 该 handle 是传输适配器而非组合根：只注册路由并托管 start/dispose 生命周期。
 *
 * @param options - Options carrying the assembled task instance.
 * @returns An IApiModule-compatible handle bound to the instance.
 */
export function createTaskApiModule(options: TaskApiModuleOptions): TaskApiModuleDef {
  if (!options?.instance) {
    throw new Error('[FAIL-CLOSED] createTaskApiModule requires options.instance');
  }
  let state: ModuleHandleState = 'created';

  return {
    name: 'Task',

    async register(context) {
      if (state !== 'created') {
        throw new Error(
          `TaskApiModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const { router, middleware, openApiRegistry } = context;

      try {
        const handlers = createTaskTransportHandlers(options.instance.api);

        const templateController = new TaskPlanController(handlers.template);
        const instanceController = new TaskOccurrenceController(handlers.instance);

        const taskRoutes = registerTaskRoutes(
          {
            templateController,
            instanceController,
          },
          middleware,
          openApiRegistry,
        );

        await options.instance.start();

        // Mount only after a successful start, so a start failure needs no
        // rollback: the host router never observes this handle's routes.
        router.use(taskRoutes);

        state = 'registered';
      } catch (error) {
        state = 'failed';
        try {
          await options.instance.dispose();
        } catch (disposeError) {
          logger.error(
            'TaskApiModule: instance dispose failed during failed registration',
            disposeError,
          );
        }
        throw error;
      }
    },

    async destroy() {
      if (state === 'disposed' || state === 'failed') {
        return;
      }
      state = 'disposed';
      await options.instance.dispose();
    },
  };
}
