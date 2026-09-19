/**
 * Governance Electron Transport Module Factory
 * 治理 Electron 传输模块工厂
 *
 * This module is a transport adapter, NOT a composition root:
 * it only wires an already-assembled `GovernanceModuleInstance` onto
 * Electron's `ipcMain` and owns that instance's start/dispose lifecycle.
 *
 * 本模块是传输适配器，而不是组合根：
 * 它只负责把已装配好的 `GovernanceModuleInstance` 挂到 Electron 的
 * `ipcMain` 上，并托管该实例的 start/dispose 生命周期。
 *
 * The host (apps/desktop) is responsible for composition: it selects the
 * PowerSync adapters, builds repositories and the event-log runtime, calls
 * `createGovernanceModule(...)`, and passes the resulting instance in through
 * `GovernanceElectronModuleOptions`. This factory never reads `context.db`,
 * never constructs repositories/use cases, and never starts a runtime adapter.
 *
 * 宿主（apps/desktop）负责组合：选择 PowerSync 适配器、构建 repository 与
 * event-log runtime、调用 `createGovernanceModule(...)`，再把组装结果通过
 * `GovernanceElectronModuleOptions` 传入。本工厂不读取 `context.db`，
 * 不创建 repository/use case，也不启动任何 runtime adapter。
 *
 * `instance.api` is the HTTP/IPC-shared application seam
 * (`GovernanceApplicationPort`). Both the Express API transport and this
 * Electron IPC transport consume the same port, so behaviour parity across
 * hosts is guaranteed by construction.
 *
 * `instance.api` 是 HTTP/IPC 共用的应用 seam（`GovernanceApplicationPort`）。
 * Express API 传输层与本 Electron IPC 传输层消费同一个 port，
 * 从而从构造上保证跨宿主行为一致。
 *
 * Per-handle state machine (`created -> registered | failed`, then any state
 * -> `disposed`):
 * - register(): only allowed from `created`. Builds the controller from
 *   `instance.api`, registers all IPC handlers, then calls `instance.start()`
 *   — channel registration happens BEFORE start, so a handler-build failure
 *   leaves no runtime side effects. On success the handle moves to
 *   `registered`; a second register() throws. On any failure it reverses
 *   exactly the channels installed by THIS call, best-effort disposes the
 *   instance (logged if dispose itself throws), moves to `failed`, and
 *   rethrows the ORIGINAL error. A failed handle must not be re-registered.
 * - destroy(): always allowed and always idempotent. It first removes all
 *   governance channels, then sets the state to `disposed` BEFORE
 *   `instance.dispose()` runs, so a reentrant/retry destroy stays a no-op even
 *   if dispose throws (destroy may propagate that error).
 *
 * 每个 handle 的状态机（`created -> registered | failed`，之后任意状态 ->
 * `disposed`）：
 * - register()：仅允许从 `created` 进入。用 `instance.api` 构建 controller、
 *   注册全部 IPC handler，然后调用 `instance.start()`——handler 先于 start
 *   注册，因此 handler 注册失败不会留下任何 runtime 副作用。成功则进入
 *   `registered`，重复 register() 抛错；任何失败会逆向移除本次调用已安装的
 *   通道、best-effort dispose 实例（若 dispose 自身抛错则记录日志）、进入
 *   `failed` 并重新抛出原始错误。failed 的 handle 不得再次注册。
 * - destroy()：任何状态都允许，且始终幂等。它先移除全部治理通道，再把状态
 *   置为 `disposed` 之后再调用 `instance.dispose()`，因此即使 dispose 抛错
 *   （该错误可向外传播），重入/重试 destroy 仍为 no-op。
 *
 * The instance is owned by the factory closure, not by a package-level
 * singleton. Re-registering the returned module handle does not create a second
 * instance; the explicit state machine above is per-handle state.
 *
 * 实例由工厂闭包持有，而不是包级 singleton。重复注册返回的 module handle
 * 不会创建第二个实例；上述显式状态机即每个 handle 自己的状态。
 */

import { ipcMain } from 'electron';
import { ok } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import type { IElectronModuleContext } from '@memoflow/contracts/electron';
import {
  CreateRuleSchema,
  GovernanceChannels,
  type DeleteRuleReq,
  type GetRuleReq,
  type GetRuleRevisionsQueryInput,
  type GovernanceRpcRequest,
  type ListRulesQueryInput,
  type SearchRulesQueryInput,
} from '@memoflow/contracts/governance';
import { GovernanceController } from '../server/transport/governance.controller';
import type { GovernanceModuleInstance } from '../server/infrastructure';
import { withAuthenticatedValidation, withAuthenticatedValue } from './authenticated-ipc';

const logger = createLogger('GovernanceElectron');
const channels = Object.values(GovernanceChannels);

/**
 * Per-handle lifecycle state. Only 'created' may enter 'registered' (or
 * 'failed' on a registration error); any state may end in 'disposed'.
 *
 * 每个 handle 的生命周期状态。只有 'created' 可以进入 'registered'
 * （或注册失败时进入 'failed'）；任意状态都可以结束于 'disposed'。
 */
type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

/**
 * Governance Electron module handle.
 * 治理 Electron 模块 handle。
 *
 * Structurally compatible with `IElectronModule` from
 * `@memoflow/contracts/electron`, but defined locally so this seam stays
 * host-shaped: the factory returns it already bound to one instance.
 *
 * 与 `@memoflow/contracts/electron` 的 `IElectronModule` 结构兼容，
 * 但在本地定义，使该 seam 保持宿主形状：工厂返回时已绑定到单个实例。
 */
export interface GovernanceElectronModuleDef {
  readonly name: string;
  register(context: IElectronModuleContext): void;
  destroy?(): void;
}

/**
 * Options carrying the already-assembled governance instance.
 * 携带已装配治理实例的选项。
 */
export interface GovernanceElectronModuleOptions {
  readonly instance: GovernanceModuleInstance;
}

/**
 * Creates the governance Electron transport module handle.
 * 创建治理 Electron 传输模块 handle。
 *
 * Turns an already-assembled `GovernanceModuleInstance` into an
 * `IElectronModule`-compatible handle. The handle is a transport adapter, not a
 * composition root: it only registers IPC channels and owns start/dispose
 * lifecycle. IPC channel names, payload schemas, controller methods and
 * response envelopes are unchanged — see the handler registrations below.
 *
 * 把已装配的 `GovernanceModuleInstance` 变成兼容 `IElectronModule` 的 handle。
 * 该 handle 是传输适配器而非组合根：只注册 IPC 通道并托管 start/dispose
 * 生命周期。IPC 通道名、payload schema、controller 方法与响应信封均保持不变——
 * 见下方各 handler 注册。
 *
 * @param options - Options carrying the assembled governance instance.
 * @returns An IElectronModule-compatible handle bound to the instance.
 */
export function createGovernanceElectronModule(
  options: GovernanceElectronModuleOptions,
): GovernanceElectronModuleDef {
  let state: ModuleHandleState = 'created';

  return {
    name: 'Governance',

    register(ctx) {
      if (state !== 'created') {
        throw new Error(
          `GovernanceElectronModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const installed: string[] = [];

      try {
        const controller = new GovernanceController(options.instance.api);

        ipcMain.handle(GovernanceChannels.RULE_LIST, (_event, query: ListRulesQueryInput = {}) =>
          controller.listRules(query),
        );
        installed.push(GovernanceChannels.RULE_LIST);

        ipcMain.handle(GovernanceChannels.RULE_GET, (_event, req: GetRuleReq) =>
          controller.getRule(req),
        );
        installed.push(GovernanceChannels.RULE_GET);

        ipcMain.handle(GovernanceChannels.RULE_SEARCH, (_event, query: SearchRulesQueryInput) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.searchRules(query, requestContext),
          ),
        );
        installed.push(GovernanceChannels.RULE_SEARCH);

        ipcMain.handle(
          GovernanceChannels.RULE_CREATE,
          withAuthenticatedValidation(ctx, CreateRuleSchema, (data, requestContext) =>
            controller.createRule(data, requestContext),
          ),
        );
        installed.push(GovernanceChannels.RULE_CREATE);

        ipcMain.handle(
          GovernanceChannels.RULE_UPDATE,
          (_event, payload: GovernanceRpcRequest<typeof GovernanceChannels.RULE_UPDATE>) =>
            withAuthenticatedValue(ctx, async (requestContext) =>
              controller.updateRule(payload, requestContext),
            ),
        );
        installed.push(GovernanceChannels.RULE_UPDATE);

        ipcMain.handle(GovernanceChannels.RULE_DELETE, (_event, payload: DeleteRuleReq) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            const result = await controller.deleteRule(payload, requestContext);
            if (!result.ok) return result;
            return ok(null);
          }),
        );
        installed.push(GovernanceChannels.RULE_DELETE);

        ipcMain.handle(GovernanceChannels.RULE_BUNDLE_EXPORT, () =>
          withAuthenticatedValue(ctx, async () => controller.exportRuleBundle()),
        );
        installed.push(GovernanceChannels.RULE_BUNDLE_EXPORT);

        ipcMain.handle(
          GovernanceChannels.RULE_REVISIONS,
          (_event, payload: GetRuleRevisionsQueryInput) => controller.getRevisions(payload),
        );
        installed.push(GovernanceChannels.RULE_REVISIONS);

        options.instance.start();
        state = 'registered';

        logger.info('Governance module registered');
      } catch (error) {
        state = 'failed';
        for (let i = installed.length - 1; i >= 0; i--) {
          ipcMain.removeHandler(installed[i]);
        }
        try {
          options.instance.dispose();
        } catch (disposeError) {
          logger.error(
            'GovernanceElectron: instance dispose failed during failed registration',
            disposeError,
          );
        }
        throw error;
      }
    },

    destroy() {
      if (state === 'disposed') {
        return;
      }

      for (const channel of channels) {
        ipcMain.removeHandler(channel);
      }
      state = 'disposed';

      options.instance.dispose();
      logger.info('Governance module destroyed');
    },
  };
}
