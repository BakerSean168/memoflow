/**
 * Repository API Transport Module Factory
 * 仓库 API 传输模块工厂
 *
 * This module is a transport adapter, NOT a composition root:
 * it only wires an already-assembled `RepositoryModuleInstance` onto the
 * Express router and owns that instance's start/dispose lifecycle.
 *
 * 本模块是传输适配器，而不是组合根：
 * 它只负责把已装配好的 `RepositoryModuleInstance` 挂到 Express 路由上，
 * 并托管该实例的 start/dispose 生命周期。
 *
 * The host (apps/api) is responsible for composition: it selects the Prisma
 * adapters, builds repositories, resolves the storage base directory, and
 * passes the closure checker / GitHub App config / cloud purger ports through
 * `createRepositoryModule(...)`. This factory never reads `context.db`, never
 * constructs repositories/use cases, and never starts a runtime adapter.
 *
 * 宿主（apps/api）负责组合：选择 Prisma 适配器、构建 repository、解析存储
 * 基础目录，并通过 `createRepositoryModule(...)` 传入 closure checker /
 * GitHub App 配置 / cloud purger ports。本工厂不读取 `context.db`，不创建
 * repository/use case，也不启动任何 runtime adapter。
 *
 * `instance.api` is the HTTP/IPC-shared application seam
 * (`RepositoryApplicationPort`). It is exposed to sibling modules in the same
 * host through `getApplicationPort()`, which returns the bound instance's api —
 * never a package-global and never a fresh composition. API AI consumes this
 * port to build its knowledge persistence / index adapters.
 *
 * `instance.api` 是 HTTP/IPC 共用的应用 seam（`RepositoryApplicationPort`）。
 * 通过 `getApplicationPort()` 暴露给同一宿主内的兄弟模块——它返回已绑定实例的
 * api，绝不是包级全局、也绝不重新组合。API AI 用它构建知识持久化 / 索引适配器。
 *
 * Per-handle state machine (`created -> registered | failed`, then any state
 * -> `disposed`):
 * - register(): only allowed from `created`. Builds the routes from
 *   `instance.api`, calls `instance.start()`, and ONLY THEN mounts them at
 *   `/repositories` — a failed start happens before any `router.use(...)` call,
 *   so the host router never observes a route for a handle that did not start.
 *   On success the handle moves to `registered`; a second register() throws.
 *   On any failure it cleans up (best-effort dispose, logged if dispose itself
 *   throws), moves to `failed`, and rethrows the ORIGINAL error.
 * - destroy(): always allowed and always idempotent. A handle in `failed` is a
 *   terminal no-op too. For a live handle the state is set to `disposed`
 *   BEFORE `instance.dispose()` runs, so a reentrant/retry destroy stays a
 *   no-op even if dispose throws (destroy may propagate that error).
 *
 * 每个 handle 的状态机（`created -> registered | failed`，之后任意状态 ->
 * `disposed`）：
 * - register()：仅允许从 `created` 进入。用 `instance.api` 构建路由、调用
 *   `instance.start()`，之后才挂载到 `/repositories`——start 失败发生在任何
 *   `router.use(...)` 之前。成功则进入 `registered`，重复 register() 抛错；
 *   任何失败先清理（best-effort dispose，若 dispose 自身抛错则记录日志），
 *   进入 `failed` 并重新抛出原始错误。
 * - destroy()：任何状态都允许，且始终幂等。处于 `failed` 的 handle 也是
 *   终态 no-op。对存活 handle，在 `instance.dispose()` 执行前先把状态置为
 *   `disposed`，因此即使 dispose 抛错（该错误可向外传播），重入/重试 destroy
 *   仍为 no-op。
 */

import type { ServerModuleHandle, ServerTransportModuleContext } from '@memoflow/host-runtime';
import { createLogger } from '@memoflow/utils/logger';
import type { RepositoryModuleInstance } from '../server/infrastructure';
import type { RepositoryApplicationPort } from '../server/application';
import { registerRepositoryRoutes } from './routes/index';

const logger = createLogger('RepositoryApi');

/**
 * Per-handle lifecycle state. Only 'created' may enter 'registered' (or
 * 'failed' on a registration error); any state may end in 'disposed'.
 *
 * 每个 handle 的生命周期状态。只有 'created' 可以进入 'registered'
 * （或注册失败时进入 'failed'）；任意状态都可以结束于 'disposed'。
 */
type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

/**
 * Transport-only context for 仓库 registration — reuses the canonical
 * shared `ServerTransportModuleContext`. Deliberately carries no `db`, so
 * this seam can never become a second composition root.
 *
 * 仓库注册的传输专用上下文——复用规范的共享 `ServerTransportModuleContext`。
 * 刻意不包含 `db`，该 seam 绝不可能是第二个组合根。
 */
export type RepositoryApiModuleContext = ServerTransportModuleContext;

/**
 * Repository API module handle extending the shared lifecycle contract.
 * Repository API 模块 handle，继承共享生命周期契约。
 */
export interface RepositoryApiModuleDef extends ServerModuleHandle<RepositoryApiModuleContext> {
  /** The composed application surface for sibling modules in the same host.
   *  同一宿主内兄弟模块使用的已组合应用表面。 */
  readonly getApplicationPort: () => RepositoryApplicationPort;
}

/**
 * Options carrying the already-assembled repository instance.
 * 携带已装配仓库实例的选项。
 */
export interface RepositoryApiModuleOptions {
  readonly instance: RepositoryModuleInstance;
}

/**
 * Creates the repository API transport module handle.
 * 创建仓库 API 传输模块 handle。
 *
 * Turns an already-assembled `RepositoryModuleInstance` into an
 * `IApiModule`-compatible handle. The handle is a transport adapter, not a
 * composition root: it only registers routes and owns start/dispose lifecycle.
 * `getApplicationPort()` returns the bound instance's api.
 *
 * 把已装配的 `RepositoryModuleInstance` 变成兼容 `IApiModule` 的 handle。
 * 该 handle 是传输适配器而非组合根：只注册路由并托管 start/dispose 生命周期。
 * `getApplicationPort()` 返回已绑定实例的 api。
 *
 * @param options - Options carrying the assembled repository instance.
 * @returns An IApiModule-compatible handle bound to the instance.
 */
export function createRepositoryApiModule(
  options: RepositoryApiModuleOptions,
): RepositoryApiModuleDef {
  if (!options?.instance) {
    throw new Error('[FAIL-CLOSED] createRepositoryApiModule requires options.instance');
  }
  let state: ModuleHandleState = 'created';

  return {
    name: 'Repository',

    getApplicationPort: () => options.instance.api,

    register(context) {
      if (state !== 'created') {
        throw new Error(
          `RepositoryApiModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const { router, middleware, openApiRegistry } = context;

      try {
        // Build the routes BEFORE starting the instance and BEFORE mounting:
        // a failed start must not leave any route installed on the host router.
        const repositoryRoutes = registerRepositoryRoutes(
          options.instance.api,
          middleware,
          openApiRegistry,
        );

        options.instance.start();

        const stackLen = router.stack.length;
        try {
          router.use('/repositories', repositoryRoutes);
        } catch (mountError) {
          router.stack.length = stackLen;
          throw mountError;
        }

        state = 'registered';
      } catch (error) {
        state = 'failed';
        try {
          options.instance.dispose();
        } catch (disposeError) {
          logger.error(
            'RepositoryApiModule: instance dispose failed during failed registration',
            disposeError,
          );
        }
        throw error;
      }
    },

    destroy() {
      if (state === 'disposed' || state === 'failed') {
        return;
      }
      state = 'disposed';
      options.instance.dispose();
    },
  };
}
