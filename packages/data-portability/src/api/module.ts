/**
 * Data Portability API Transport Module Factory
 * 数据导出导入 API 传输模块工厂
 *
 * This module is a transport adapter, NOT a composition root:
 * it only wires an already-assembled `DataPortabilityModuleInstance` onto the
 * Express router and owns that instance's start/dispose lifecycle.
 *
 * 本模块是传输适配器，而不是组合根：
 * 它只负责把已装配好的 `DataPortabilityModuleInstance` 挂到 Express 路由上，
 * 并托管该实例的 start/dispose 生命周期。
 *
 * The host (apps/api) is responsible for composition: it registers the
 * owner-provided V3 capabilities, creates the separate server-held data
 * disclosure application port, calls `createDataPortabilityModule(...)`, and
 * passes the resulting instance in through
 * `DataPortabilityApiModuleOptions`. The server-held disclosure port is a
 * transport-level route dependency carried as an explicit option (it is
 * host-created, never inferred here).
 *
 * 宿主（apps/api）负责组合：注册 owner 提供的 V3 capability、创建独立的
 * server-held data disclosure 应用 port、调用
 * `createDataPortabilityModule(...)`，再把组装结果通过
 * `DataPortabilityApiModuleOptions` 传入。server-held disclosure port 是
 * 路由层的传输依赖，作为显式选项携带（由宿主创建，绝不在本模块推断）。
 *
 * `instance.api` is the HTTP/IPC-shared application seam
 * (`DataPortabilityApplicationPort`). Both the API transport (this module) and
 * the Electron IPC transport consume the same port, so behaviour parity across
 * hosts is guaranteed by construction.
 *
 * `instance.api` 是 HTTP/IPC 共用的应用 seam（`DataPortabilityApplicationPort`）。
 * API 传输层（本模块）与 Electron IPC 传输层消费同一个 port，
 * 从而从构造上保证跨宿主行为一致。
 *
 * Per-handle state machine (`created -> registered | failed`, then any state
 * -> `disposed`):
 * - register(): only allowed from `created`. Builds the routes from
 *   `instance.api`, calls `instance.start()`, and ONLY THEN mounts them at
 *   `/data-portability` — a failed start happens before any `router.use(...)`
 *   call, so the host router never observes a route for a handle that did not
 *   start. On success the handle moves to `registered`; a second register()
 *   throws. On any failure it cleans up (best-effort dispose, logged if dispose
 *   itself throws), moves to `failed`, and rethrows the ORIGINAL error.
 * - destroy(): always allowed and always idempotent. A handle in `failed` is a
 *   terminal no-op too. For a live handle the state is set to `disposed`
 *   BEFORE `instance.dispose()` runs, so a reentrant/retry destroy stays a
 *   no-op even if dispose throws (destroy may propagate that error).
 *
 * 每个 handle 的状态机（`created -> registered | failed`，之后任意状态 ->
 * `disposed`）：
 * - register()：仅允许从 `created` 进入。用 `instance.api` 构建路由、调用
 *   `instance.start()`，之后才挂载到 `/data-portability`——start 失败发生在
 *   任何 `router.use(...)` 之前。成功则进入 `registered`，重复 register()
 *   抛错；任何失败先清理（best-effort dispose，若 dispose 自身抛错则记录
 *   日志），进入 `failed` 并重新抛出原始错误。
 * - destroy()：任何状态都允许，且始终幂等。处于 `failed` 的 handle 也是
 *   终态 no-op。对存活 handle，在 `instance.dispose()` 执行前先把状态置为
 *   `disposed`，因此即使 dispose 抛错（该错误可向外传播），重入/重试 destroy
 *   仍为 no-op。
 */

import type { ServerModuleHandle, ServerTransportModuleContext } from '@memoflow/contracts/shared';
import { createLogger } from '@memoflow/utils/logger';
import { registerDataPortabilityRoutes } from './routes';
import type { DataPortabilityModuleInstance } from '../server/infrastructure';
import type { ServerHeldDataDisclosureApplicationPort } from '../server/application';

const logger = createLogger('DataPortabilityApi');

/**
 * Per-handle lifecycle state. Only 'created' may enter 'registered' (or
 * 'failed' on a registration error); any state may end in 'disposed'.
 *
 * 每个 handle 的生命周期状态。只有 'created' 可以进入 'registered'
 * （或注册失败时进入 'failed'）；任意状态都可以结束于 'disposed'。
 */
type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

/**
 * Transport-only context for data-portability registration.
 * Deliberately picks no `db`: the api module never needs persistence, and this
 * keeps the seam from becoming a second composition root.
 *
 * 数据导出导入注册的传输专用上下文。刻意不包含 `db`：API module 不需要
 * 持久化，这也避免该 seam 变成第二个组合根。
 */
export type DataPortabilityApiModuleContext = ServerTransportModuleContext;

/**
 * DataPortability API module handle extending the shared lifecycle contract.
 * DataPortability API 模块 handle，继承共享生命周期契约。
 */
export interface DataPortabilityApiModuleDef extends ServerModuleHandle<DataPortabilityApiModuleContext> {}

/**
 * Options carrying the already-assembled data-portability instance and the
 * host-created server-held disclosure port used by the disclosure routes.
 *
 * 携带已装配 data-portability 实例以及由宿主创建的、disclosure 路由使用的
 * server-held disclosure port 的选项。
 */
export interface DataPortabilityApiModuleOptions {
  readonly instance: DataPortabilityModuleInstance;
  readonly serverHeldDataDisclosureApi: ServerHeldDataDisclosureApplicationPort;
}

/**
 * Creates the data-portability API transport module handle.
 * 创建数据导出导入 API 传输模块 handle。
 *
 * Turns an already-assembled `DataPortabilityModuleInstance` into an
 * `IApiModule`-compatible handle. The handle is a transport adapter, not a
 * composition root: it only registers routes and owns start/dispose lifecycle.
 *
 * 把已装配的 `DataPortabilityModuleInstance` 变成兼容 `IApiModule` 的 handle。
 * 该 handle 是传输适配器而非组合根：只注册路由并托管 start/dispose 生命周期。
 *
 * @param options - Options carrying the assembled instance and disclosure port.
 * @returns An IApiModule-compatible handle bound to the instance.
 */
export function createDataPortabilityApiModule(
  options: DataPortabilityApiModuleOptions,
): DataPortabilityApiModuleDef {
  if (!options?.instance) {
    throw new Error('[FAIL-CLOSED] createDataPortabilityApiModule requires options.instance');
  }
  let state: ModuleHandleState = 'created';

  return {
    name: 'DataPortability',

    register(context) {
      if (state !== 'created') {
        throw new Error(
          `DataPortabilityApiModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const { router, middleware, openApiRegistry } = context;

      try {
        const routes = registerDataPortabilityRoutes(
          options.instance.api,
          options.serverHeldDataDisclosureApi,
          middleware,
          openApiRegistry,
        );

        options.instance.start();

        const stackLen = router.stack.length;
        try {
          router.use('/data-portability', routes);
        } catch (mountError) {
          router.stack.length = stackLen;
          throw mountError;
        }

        state = 'registered';
        logger.info('DataPortability module registered');
      } catch (error) {
        state = 'failed';
        try {
          options.instance.dispose();
        } catch (disposeError) {
          logger.error(
            'DataPortabilityApiModule: instance dispose failed during failed registration',
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
      logger.info('DataPortability module destroyed');
    },
  };
}
