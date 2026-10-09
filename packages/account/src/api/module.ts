/**
 * Account API Transport Module Factory
 * 账户 API 传输模块工厂
 *
 * This module is a transport adapter, NOT a composition root:
 * it only wires an already-assembled `AccountModuleInstance` onto the Express
 * router and owns that instance's start/dispose lifecycle.
 *
 * 本模块是传输适配器，而不是组合根：
 * 它只负责把已装配好的 `AccountModuleInstance` 挂到 Express 路由上，
 * 并托管该实例的 start/dispose 生命周期。
 *
 * The host (apps/api) is responsible for composition: it selects the Prisma
 * adapters, builds repositories, the CloudAuth revocation port and runtime
 * contributions, calls `createAccountModule(...)`, and passes the resulting
 * instance in through `AccountApiModuleOptions`. This factory never reads
 * `context.db`, never constructs repositories/use cases, and never starts a
 * runtime adapter. CloudAuth-specific behavior is already encoded in the
 * instance (closure revocation), so register() needs no auth capability.
 *
 * 宿主（apps/api）负责组合：选择 Prisma 适配器、构建 repository、
 * CloudAuth 撤销 port 与 runtime contribution、调用 `createAccountModule(...)`，
 * 再把组装结果通过 `AccountApiModuleOptions` 传入。本工厂不读取
 * `context.db`，不创建 repository/use case，也不启动任何 runtime adapter。
 * CloudAuth 相关行为已编码在实例中（closure revocation），因此 register()
 * 不需要任何 auth capability。
 *
 * `instance.api` is the HTTP/IPC-shared application seam
 * (`AccountApplicationPort`). Both the API transport (this module) and the
 * Electron IPC transport consume the same port, so behaviour parity across
 * hosts is guaranteed by construction.
 *
 * `instance.api` 是 HTTP/IPC 共用的应用 seam（`AccountApplicationPort`）。
 * API 传输层（本模块）与 Electron IPC 传输层消费同一个 port，
 * 从而从构造上保证跨宿主行为一致。
 *
 * Per-handle state machine (`created -> registered | failed`, then any state
 * -> `disposed`):
 * - register(): only allowed from `created`. Builds the routes from
 *   `instance.api`, calls `instance.start()`, and ONLY THEN mounts them at
 *   `/accounts` — a failed start happens before any `router.use(...)` call,
 *   so the host router never observes a route for a handle that did not start
 *   (no rollback/unmount is needed). A mid-mount failure truncates the router
 *   stack back to its pre-mount length so this call never leaves a partial
 *   mount behind. On success the handle moves to `registered`; a second
 *   register() throws. On any failure it cleans up
 *   (best-effort dispose, logged if dispose itself throws), moves to `failed`,
 *   and rethrows the ORIGINAL error. A failed handle must not be re-registered.
 * - destroy(): always allowed and always idempotent. A handle in `failed` is
 *   a terminal no-op too: the instance was already disposed in the register()
 *   failure path. For a live handle the state is set to `disposed` BEFORE
 *   `instance.dispose()` runs, so a reentrant/retry destroy stays a no-op even
 *   if dispose throws (destroy may propagate that error).
 *
 * 每个 handle 的状态机（`created -> registered | failed`，之后任意状态 ->
 * `disposed`）：
 * - register()：仅允许从 `created` 进入。用 `instance.api` 构建路由、调用
 *   `instance.start()`，之后才挂载到 `/accounts`——start 失败发生在任何
 *   `router.use(...)` 之前，因此宿主 router 永远不会看到一个未启动成功
 *   handle 的路由（无需回滚/卸载）。成功则进入 `registered`，重复 register()
 *   抛错；任何失败先清理（best-effort dispose，若 dispose 自身抛错则记录
 *   日志），进入 `failed` 并重新抛出原始错误。failed 的 handle 不得再次注册。
 * - destroy()：任何状态都允许，且始终幂等。处于 `failed` 的 handle 也是
 *   终态 no-op——其实例已在 register() 的失败路径中 dispose。对存活 handle，
 *   在 `instance.dispose()` 执行前先把状态置为 `disposed`，因此即使 dispose
 *   抛错（该错误可向外传播），重入/重试 destroy 仍为 no-op。
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
import type { AccountModuleInstance } from '../server/infrastructure';
import { registerAccountRoutes } from './routes';
import type { BusinessDataSummaryReader } from '../server/application';

const logger = createLogger('AccountApi');

/**
 * Per-handle lifecycle state. Only 'created' may enter 'registered' (or
 * 'failed' on a registration error); any state may end in 'disposed'.
 *
 * 每个 handle 的生命周期状态。只有 'created' 可以进入 'registered'
 * （或注册失败时进入 'failed'）；任意状态都可以结束于 'disposed'。
 */
type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

/**
 * Transport-only context for 账户 registration — reuses the canonical
 * shared `ServerTransportModuleContext`. Deliberately carries no `db`, so
 * this seam can never become a second composition root.
 *
 * 账户注册的传输专用上下文——复用规范的共享 `ServerTransportModuleContext`。
 * 刻意不包含 `db`，该 seam 绝不可能是第二个组合根。
 */
export type AccountApiModuleContext = ServerTransportModuleContext;

/**
 * Account API module handle extending the shared lifecycle contract.
 * Account API 模块 handle，继承共享生命周期契约。
 */
export interface AccountApiModuleDef extends ServerModuleHandle<AccountApiModuleContext> {}

/**
 * Options carrying the already-assembled account instance.
 * 携带已装配账户实例的选项。
 */
export interface AccountApiModuleOptions {
  readonly instance: AccountModuleInstance;
  readonly readDataSummary?: BusinessDataSummaryReader;
}

/**
 * Creates the account API transport module handle.
 * 创建账户 API 传输模块 handle。
 *
 * Turns an already-assembled `AccountModuleInstance` into an
 * `IApiModule`-compatible handle. The handle is a transport adapter, not a
 * composition root: it only registers routes and owns start/dispose lifecycle.
 *
 * 把已装配的 `AccountModuleInstance` 变成兼容 `IApiModule` 的 handle。
 * 该 handle 是传输适配器而非组合根：只注册路由并托管 start/dispose 生命周期。
 *
 * @param options - Options carrying the assembled account instance.
 * @returns An IApiModule-compatible handle bound to the instance.
 */
export function createAccountApiModule(options: AccountApiModuleOptions): AccountApiModuleDef {
  if (!options?.instance) {
    throw new Error('[FAIL-CLOSED] createAccountApiModule requires options.instance');
  }
  let state: ModuleHandleState = 'created';

  return {
    name: 'Account',

    register(context) {
      if (state !== 'created') {
        throw new Error(
          `AccountApiModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const { router, middleware, openApiRegistry } = context;

      try {
        // Build the routes BEFORE starting the instance and BEFORE mounting:
        // a failed start must not leave any route installed on the host router.
        const accountRoutes = registerAccountRoutes(
          options.instance.api,
          middleware,
          openApiRegistry,
          options.readDataSummary,
        );

        options.instance.start();

        // Mount only after a successful start, so a start failure needs no
        // rollback: the host router never observes this handle's routes.
        // Capture the pre-mount stack length and truncate on any mount error,
        // so this call's mounts are rolled back together. Safe because
        // ApiBootstrapper does not expose the router until all registrations
        // succeed.
        const stackLen = router.stack.length;
        try {
          router.use('/accounts', accountRoutes);
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
            'AccountApiModule: instance dispose failed during failed registration',
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
