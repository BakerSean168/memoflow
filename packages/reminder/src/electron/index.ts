/**
 * Reminder Electron Transport Module Factory
 * 提醒 Electron 传输模块工厂
 *
 * This module is a transport adapter, NOT a composition root:
 * it only wires an already-assembled `ReminderModuleInstance` onto Electron's
 * `ipcMain` and owns that instance's start/dispose lifecycle.
 *
 * 本模块是传输适配器，而不是组合根：
 * 它只负责把已装配好的 `ReminderModuleInstance` 挂到 Electron 的 `ipcMain` 上，
 * 并托管该实例的 start/dispose 生命周期。
 *
 * The host (apps/desktop) is responsible for composition: it selects the
 * PowerSync adapters, builds repositories, the closure checker and the
 * cron/snooze/reliable runtime contributions, calls `createReminderModule(...)`,
 * and passes the resulting instance in through `ReminderElectronModuleOptions`.
 * This factory never reads `ctx.db`, never constructs repositories/use cases,
 * and never starts a runtime adapter.
 *
 * 宿主（apps/desktop）负责组合：选择 PowerSync 适配器、构建 repository、
 * closure checker 与 cron/snooze/reliable runtime contribution、调用
 * `createReminderModule(...)`，再把组装结果通过
 * `ReminderElectronModuleOptions` 传入。本工厂不读取 `ctx.db`，不创建
 * repository/use case，也不启动任何 runtime adapter。
 *
 * `instance.api` is the HTTP/IPC-shared application seam
 * (`ReminderApplicationPort`). Both the Express API transport and this Electron
 * IPC transport consume the same port, so behaviour parity across hosts is
 * guaranteed by construction.
 *
 * `instance.api` 是 HTTP/IPC 共用的应用 seam（`ReminderApplicationPort`）。
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
 * - destroy(): always allowed and always idempotent. A handle in `failed` is a
 *   terminal no-op too. For a live handle it first removes all reminder
 *   channels, then sets the state to `disposed` BEFORE `instance.dispose()`
 *   runs, so a reentrant/retry destroy stays a no-op even if dispose throws
 *   (destroy may propagate that error).
 *
 * 每个 handle 的状态机（`created -> registered | failed`，之后任意状态 ->
 * `disposed`）：
 * - register()：仅允许从 `created` 进入。用 `instance.api` 构建 controller、
 *   注册全部 IPC handler，然后调用 `instance.start()`——handler 先于 start
 *   注册，因此 handler 注册失败不会留下任何 runtime 副作用。成功则进入
 *   `registered`，重复 register() 抛错；任何失败会逆向移除本次调用已安装的
 *   通道、best-effort dispose 实例（若 dispose 自身抛错则记录日志）、进入
 *   `failed` 并重新抛出原始错误。failed 的 handle 不得再次注册。
 * - destroy()：任何状态都允许，且始终幂等。处于 `failed` 的 handle 也是
 *   终态 no-op。对存活 handle，先移除全部提醒通道，再把状态置为 `disposed`
 *   之后再调用 `instance.dispose()`，因此即使 dispose 抛错（该错误可向外
 *   传播），重入/重试 destroy 仍为 no-op。
 */

import { ipcMain } from 'electron';
import { ok } from '@memoflow/contracts/result';
import { ReminderChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import { ReminderController } from '../server/transport/reminder.controller';
import { createLogger } from '@memoflow/utils/logger';
import { withAuthenticatedValue } from './authenticated-ipc';
import type { ReminderModuleInstance } from '../server/infrastructure';

const logger = createLogger('ReminderElectron');

const allChannels = Object.values(ReminderChannels);

/**
 * Per-handle lifecycle state. Only 'created' may enter 'registered' (or
 * 'failed' on a registration error); any state may end in 'disposed'.
 *
 * 每个 handle 的生命周期状态。只有 'created' 可以进入 'registered'
 * （或注册失败时进入 'failed'）；任意状态都可以结束于 'disposed'。
 */
type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

/**
 * Reminder Electron module handle.
 * 提醒 Electron 模块 handle。
 *
 * Structurally compatible with `IElectronModule` from
 * `@memoflow/contracts/electron`, but defined locally so this seam stays
 * host-shaped: the factory returns it already bound to one instance.
 *
 * 与 `@memoflow/contracts/electron` 的 `IElectronModule` 结构兼容，
 * 但在本地定义，使该 seam 保持宿主形状：工厂返回时已绑定到单个实例。
 */
export interface ReminderElectronModuleDef {
  readonly name: string;
  register(context: IElectronModuleContext): Promise<void>;
  destroy?(): Promise<void>;
}

/**
 * Options carrying the already-assembled reminder instance.
 * 携带已装配提醒实例的选项。
 */
export interface ReminderElectronModuleOptions {
  readonly instance: ReminderModuleInstance;
}

/**
 * Creates the reminder Electron transport module handle.
 * 创建提醒 Electron 传输模块 handle。
 *
 * Turns an already-assembled `ReminderModuleInstance` into an
 * `IElectronModule`-compatible handle. The handle is a transport adapter, not a
 * composition root: it only registers IPC channels and owns start/dispose
 * lifecycle. IPC channel names, payload schemas, controller methods and
 * response envelopes are unchanged — see the handler registrations below.
 *
 * 把已装配的 `ReminderModuleInstance` 变成兼容 `IElectronModule` 的 handle。
 * 该 handle 是传输适配器而非组合根：只注册 IPC 通道并托管 start/dispose
 * 生命周期。IPC 通道名、payload schema、controller 方法与响应信封均保持不变——
 * 见下方各 handler 注册。
 *
 * @param options - Options carrying the assembled reminder instance.
 * @returns An IElectronModule-compatible handle bound to the instance.
 */
export function createReminderElectronModule(
  options: ReminderElectronModuleOptions,
): ReminderElectronModuleDef {
  if (!options?.instance) {
    throw new Error('[FAIL-CLOSED] createReminderElectronModule requires options.instance');
  }
  let state: ModuleHandleState = 'created';

  return {
    name: 'Reminder',

    async register(ctx: IElectronModuleContext): Promise<void> {
      if (state !== 'created') {
        throw new Error(
          `ReminderElectronModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const installed: string[] = [];

      try {
        // 1. Controller (Zod validation + use case orchestration)
        //    控制器（Zod 验证 + 用例编排）
        const controller = new ReminderController(options.instance.api);

        // 2. IPC Handlers — thin transport mapping
        //    IPC 处理器 — 精简的传输层映射

        // Template handlers / 模板处理器
        ipcMain.handle(ReminderChannels.TEMPLATE_LIST, async () =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.listTemplates(requestContext),
          ),
        );
        installed.push(ReminderChannels.TEMPLATE_LIST);
        ipcMain.handle(ReminderChannels.TEMPLATE_GET_BY_USER, async () =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.listTemplates(requestContext),
          ),
        );
        installed.push(ReminderChannels.TEMPLATE_GET_BY_USER);
        ipcMain.handle(ReminderChannels.TEMPLATE_GET, async (_event, id) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.getTemplate(id, requestContext),
          ),
        );
        installed.push(ReminderChannels.TEMPLATE_GET);
        ipcMain.handle(ReminderChannels.TEMPLATE_CREATE, async (_event, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.createTemplate(dto, requestContext),
          ),
        );
        installed.push(ReminderChannels.TEMPLATE_CREATE);
        ipcMain.handle(ReminderChannels.TEMPLATE_UPDATE, async (_event, id, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.updateTemplate(id, dto, requestContext),
          ),
        );
        installed.push(ReminderChannels.TEMPLATE_UPDATE);
        ipcMain.handle(ReminderChannels.TEMPLATE_DELETE, async (_event, id) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            const result = await controller.deleteTemplate(id, requestContext);
            if (!result.ok) return result;
            return ok(null);
          }),
        );
        installed.push(ReminderChannels.TEMPLATE_DELETE);

        // Toggle template enabled/paused state.
        // 切换模板启用/暂停状态。
        ipcMain.handle(ReminderChannels.TEMPLATE_TOGGLE_ENABLED, async (_event, id) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.toggleTemplate(id, requestContext),
          ),
        );
        installed.push(ReminderChannels.TEMPLATE_TOGGLE_ENABLED);
        ipcMain.handle(ReminderChannels.TEMPLATE_MOVE_TO_GROUP, async (_event, id, payload) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.moveTemplate(id, payload ?? {}, requestContext),
          ),
        );
        installed.push(ReminderChannels.TEMPLATE_MOVE_TO_GROUP);
        ipcMain.handle(ReminderChannels.UPCOMING_GET, async (_event, params) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.getUpcomingReminders(params ?? {}, requestContext),
          ),
        );
        installed.push(ReminderChannels.UPCOMING_GET);
        ipcMain.handle(ReminderChannels.TODAY_SCHEDULE_GET, async (_event, params) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.getTodaySchedule(params ?? {}, requestContext),
          ),
        );
        installed.push(ReminderChannels.TODAY_SCHEDULE_GET);

        // Group handlers / 分组处理器
        ipcMain.handle(ReminderChannels.GROUP_LIST, async () =>
          withAuthenticatedValue(ctx, async (requestContext) => controller.listGroups(requestContext)),
        );
        installed.push(ReminderChannels.GROUP_LIST);
        ipcMain.handle(ReminderChannels.GROUP_GET_BY_USER, async () =>
          withAuthenticatedValue(ctx, async (requestContext) => controller.listGroups(requestContext)),
        );
        installed.push(ReminderChannels.GROUP_GET_BY_USER);
        ipcMain.handle(ReminderChannels.GROUP_GET, async (_event, id) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.getGroup(id, requestContext),
          ),
        );
        installed.push(ReminderChannels.GROUP_GET);
        ipcMain.handle(ReminderChannels.GROUP_CREATE, async (_event, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.createGroup(dto, requestContext),
          ),
        );
        installed.push(ReminderChannels.GROUP_CREATE);
        // Accept requestContext for consistency; updateGroup does not use it yet.
        // 为一致性接收 requestContext；updateGroup 目前尚未使用。
        ipcMain.handle(ReminderChannels.GROUP_UPDATE, async (_event, id, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.updateGroup(id, dto, requestContext),
          ),
        );
        installed.push(ReminderChannels.GROUP_UPDATE);
        ipcMain.handle(ReminderChannels.GROUP_DELETE, async (_event, id) =>
          withAuthenticatedValue(ctx, async (requestContext) => {
            const result = await controller.deleteGroup(id, requestContext);
            if (!result.ok) return result;
            return ok(null);
          }),
        );
        installed.push(ReminderChannels.GROUP_DELETE);
        ipcMain.handle(ReminderChannels.GROUP_TOGGLE_STATUS, async (_event, id) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.toggleGroup(id, requestContext),
          ),
        );
        installed.push(ReminderChannels.GROUP_TOGGLE_STATUS);
        ipcMain.handle(ReminderChannels.PREFERENCES_GET, async () =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.getPreferences(requestContext),
          ),
        );
        installed.push(ReminderChannels.PREFERENCES_GET);
        ipcMain.handle(ReminderChannels.PREFERENCES_UPDATE, async (_event, dto) =>
          withAuthenticatedValue(ctx, async (requestContext) =>
            controller.updatePreferences(dto ?? {}, requestContext),
          ),
        );
        installed.push(ReminderChannels.PREFERENCES_UPDATE);

        await options.instance.start();
        state = 'registered';

        logger.info('Reminder module registered');
      } catch (error) {
        state = 'failed';
        for (let i = installed.length - 1; i >= 0; i--) {
          ipcMain.removeHandler(installed[i]);
        }
        try {
          await options.instance.dispose();
        } catch (disposeError) {
          logger.error(
            'ReminderElectron: instance dispose failed during failed registration',
            disposeError,
          );
        }
        throw error;
      }
    },

    async destroy(): Promise<void> {
      if (state === 'disposed' || state === 'failed') {
        return;
      }

      for (const ch of allChannels) {
        ipcMain.removeHandler(ch);
      }
      state = 'disposed';

      await options.instance.dispose();
      logger.info('Reminder module destroyed');
    },
  };
}

export {
  createReminderPowerSyncScheduleExecutionSource,
  createReminderPowerSyncScheduleProjectionSource,
} from '../server/infrastructure';
