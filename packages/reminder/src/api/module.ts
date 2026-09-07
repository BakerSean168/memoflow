/**
 * Reminder API Transport Module Factory
 * 提醒 API 传输模块工厂
 *
 * This module is a transport adapter, NOT a composition root:
 * it only wires an already-assembled `ReminderModuleInstance` onto the Express
 * router and owns that instance's start/dispose lifecycle.
 *
 * 本模块是传输适配器，而不是组合根：
 * 它只负责把已装配好的 `ReminderModuleInstance` 挂到 Express 路由上，
 * 并托管该实例的 start/dispose 生命周期。
 *
 * The host (apps/api) is responsible for composition: it selects the Prisma
 * adapters, builds repositories, the closure checker and the canonical
 * runtime contributions, calls `createReminderModule(...)`, and passes
 * the resulting instance in through `ReminderApiModuleOptions`. This factory
 * never reads `context.db`, never constructs repositories/use cases, and never
 * starts a runtime adapter.
 *
 * 宿主（apps/api）负责组合：选择 Prisma 适配器、构建 repository、closure
 * checker 与规范 runtime contribution、调用
 * `createReminderModule(...)`，再把组装结果通过 `ReminderApiModuleOptions`
 * 传入。本工厂不读取 `context.db`，不创建 repository/use case，也不启动任何
 * runtime adapter。
 *
 * `instance.api` is the HTTP/IPC-shared application seam
 * (`ReminderApplicationPort`). Both the API transport (this module) and the
 * Electron IPC transport consume the same port, so behaviour parity across
 * hosts is guaranteed by construction.
 *
 * `instance.api` 是 HTTP/IPC 共用的应用 seam（`ReminderApplicationPort`）。
 * API 传输层（本模块）与 Electron IPC 传输层消费同一个 port，
 * 从而从构造上保证跨宿主行为一致。
 *
 * Per-handle state machine (`created -> registered | failed`, then any state
 * -> `disposed`):
 * - register(): only allowed from `created`. Builds the routes from
 *   `instance.api`, AWAITS `instance.start()`, and ONLY THEN mounts them at
 *   `/reminders` — a failed start happens before any `router.use(...)` call,
 *   so the host router never observes a route for a handle that did not start.
 *   On success the handle moves to `registered`; a second register() throws.
 *   On any failure it cleans up (best-effort await dispose, logged if dispose
 *   itself throws), moves to `failed`, and rethrows the ORIGINAL error.
 * - destroy(): always allowed and always idempotent. A handle in `failed` is a
 *   terminal no-op too. For a live handle the state is set to `disposed`
 *   BEFORE `instance.dispose()` runs, so a reentrant/retry destroy stays a
 *   no-op even if dispose throws (destroy may propagate that error).
 *
 * 每个 handle 的状态机（`created -> registered | failed`，之后任意状态 ->
 * `disposed`）：
 * - register()：仅允许从 `created` 进入。用 `instance.api` 构建路由、await
 *   `instance.start()`，之后才挂载到 `/reminders`——start 失败发生在任何
 *   `router.use(...)` 之前。成功则进入 `registered`，重复 register() 抛错；
 *   任何失败先清理（best-effort await dispose，若 dispose 自身抛错则记录
 *   日志），进入 `failed` 并重新抛出原始错误。
 * - destroy()：任何状态都允许，且始终幂等。处于 `failed` 的 handle 也是
 *   终态 no-op。对存活 handle，在 `instance.dispose()` 执行前先把状态置为
 *   `disposed`，因此即使 dispose 抛错（该错误可向外传播），重入/重试 destroy
 *   仍为 no-op。
 */

import type { ServerModuleHandle, ServerTransportModuleContext } from '@memoflow/contracts/shared';
import { createLogger } from '@memoflow/utils/logger';
import type { ReminderModuleInstance } from '../server/infrastructure';
import { registerReminderRoutes } from './routes';

const logger = createLogger('ReminderApi');

/**
 * Per-handle lifecycle state. Only 'created' may enter 'registered' (or
 * 'failed' on a registration error); any state may end in 'disposed'.
 *
 * 每个 handle 的生命周期状态。只有 'created' 可以进入 'registered'
 * （或注册失败时进入 'failed'）；任意状态都可以结束于 'disposed'。
 */
type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

/**
 * Transport-only context for 提醒 registration — reuses the canonical
 * shared `ServerTransportModuleContext`. Deliberately carries no `db`, so
 * this seam can never become a second composition root.
 *
 * 提醒注册的传输专用上下文——复用规范的共享 `ServerTransportModuleContext`。
 * 刻意不包含 `db`，该 seam 绝不可能是第二个组合根。
 */
export type ReminderApiModuleContext = ServerTransportModuleContext;

/**
 * Reminder API module handle extending the shared lifecycle contract.
 * Reminder API 模块 handle，继承共享生命周期契约。
 */
export interface ReminderApiModuleDef extends ServerModuleHandle<ReminderApiModuleContext> {}

/**
 * Options carrying the already-assembled reminder instance.
 * 携带已装配提醒实例的选项。
 */
export interface ReminderApiModuleOptions {
  readonly instance: ReminderModuleInstance;
}

/**
 * Creates the reminder API transport module handle.
 * 创建提醒 API 传输模块 handle。
 *
 * Turns an already-assembled `ReminderModuleInstance` into an
 * `IApiModule`-compatible handle. The handle is a transport adapter, not a
 * composition root: it only registers routes and owns start/dispose lifecycle.
 *
 * 把已装配的 `ReminderModuleInstance` 变成兼容 `IApiModule` 的 handle。
 * 该 handle 是传输适配器而非组合根：只注册路由并托管 start/dispose 生命周期。
 *
 * @param options - Options carrying the assembled reminder instance.
 * @returns An IApiModule-compatible handle bound to the instance.
 */
export function createReminderApiModule(options: ReminderApiModuleOptions): ReminderApiModuleDef {
  if (!options?.instance) {
    throw new Error('[FAIL-CLOSED] createReminderApiModule requires options.instance');
  }
  let state: ModuleHandleState = 'created';

  return {
    name: 'Reminder',

    async register(context) {
      if (state !== 'created') {
        throw new Error(
          `ReminderApiModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const { router, middleware, openApiRegistry } = context;

      try {
        // Build the routes BEFORE starting the instance and BEFORE mounting:
        // a failed start must not leave any route installed on the host router.
        const reminderRoutes = registerReminderRoutes(
          options.instance.api,
          middleware,
          openApiRegistry,
        );

        await options.instance.start();

        const stackLen = router.stack.length;
        try {
          router.use('/reminders', reminderRoutes);
        } catch (mountError) {
          router.stack.length = stackLen;
          throw mountError;
        }

        state = 'registered';
      } catch (error) {
        state = 'failed';
        try {
          await options.instance.dispose();
        } catch (disposeError) {
          logger.error(
            'ReminderApiModule: instance dispose failed during failed registration',
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
