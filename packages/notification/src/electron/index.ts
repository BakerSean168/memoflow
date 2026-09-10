/**
 * Notification Electron Transport Module Factory
 * 通知 Electron 传输模块工厂
 *
 * This module is a transport adapter, NOT a composition root:
 * it only wires an already-assembled `NotificationModuleInstance` onto
 * Electron's `ipcMain` and owns that instance's start/dispose lifecycle.
 *
 * 本模块是传输适配器，而不是组合根：
 * 它只负责把已装配好的 `NotificationModuleInstance` 挂到 Electron 的
 * `ipcMain` 上，并托管该实例的 start/dispose 生命周期。
 *
 * The host (apps/desktop) is responsible for composition: it selects the
 * PowerSync adapters, builds repositories, the closure checker, channel
 * capabilities and the native desktop transport, and calls
 * `createNotificationModule(...)`. Those host capabilities are already encoded
 * in the instance — this factory never reads them from context, never reads
 * `ctx.db`, never constructs repositories/use cases, and never starts a runtime
 * adapter.
 *
 * 宿主（apps/desktop）负责组合：选择 PowerSync 适配器、构建 repository、
 * closure checker、channel capabilities 与原生 desktop transport，并调用
 * `createNotificationModule(...)`。这些宿主能力已编码在实例中——本工厂绝不
 * 从 context 读取它们、绝不读取 `ctx.db`、不创建 repository/use case，也不
 * 启动任何 runtime adapter。
 *
 * `instance.api` is the HTTP/IPC-shared application seam
 * (`NotificationApplicationPort`). Both the Express API transport and this
 * Electron IPC transport consume the same port, so behaviour parity across
 * hosts is guaranteed by construction.
 *
 * `instance.api` 是 HTTP/IPC 共用的应用 seam（`NotificationApplicationPort`）。
 * Express API 传输层与本 Electron IPC 传输层消费同一个 port，
 * 从而从构造上保证跨宿主行为一致。
 *
 * Channel ownership: this handle installs and cleans up ONLY the core CRUD /
 * preferences channels below. The custom-renderer channels
 * (`CUSTOM_RECEIVE`/`CUSTOM_CLICK`/`CUSTOM_CLOSE`/`CUSTOM_RESIZE`/
 * `CUSTOM_MOUSE_ENTER`/`CUSTOM_MOUSE_LEAVE`/`CUSTOM_RENDERER_READY`) are
 * installed by the desktop `custom-notification.manager`, which remains their
 * owner — this module must never remove channels it did not install. `destroy`
 * therefore removes exactly the core channels this handle registered.
 *
 * 通道归属：本 handle 只安装并清理下列核心 CRUD / preferences 通道。
 * custom-renderer 通道（`CUSTOM_RECEIVE`/`CUSTOM_CLICK`/`CUSTOM_CLOSE`/
 * `CUSTOM_RESIZE`/`CUSTOM_MOUSE_ENTER`/`CUSTOM_MOUSE_LEAVE`/
 * `CUSTOM_RENDERER_READY`）由桌面 `custom-notification.manager` 安装，其归属
 * 仍是该 manager——本模块绝不能移除未由本模块安装的通道。因此 `destroy`
 * 只移除本 handle 注册的核心通道。
 *
 * Per-handle state machine (`created -> registered | failed`, then any state
 * -> `disposed`):
 * - register(): only allowed from `created`. Builds the controller from
 *   `instance.api`, registers all core IPC handlers, then calls
 *   `instance.start()` — channel registration happens BEFORE start, so a
 *   handler-build failure leaves no runtime side effects. On success the handle
 *   moves to `registered`; a second register() throws. On any failure it
 *   reverses exactly the channels installed by THIS call, best-effort disposes
 *   the instance (logged if dispose itself throws), moves to `failed`, and
 *   rethrows the ORIGINAL error. A failed handle must not be re-registered.
 * - destroy(): always allowed and always idempotent. A handle in `failed` is a
 *   terminal no-op too. For a live handle it first removes all core
 *   notification channels, then sets the state to `disposed` BEFORE
 *   `instance.dispose()` runs, so a reentrant/retry destroy stays a no-op even
 *   if dispose throws (destroy may propagate that error).
 *
 * 每个 handle 的状态机（`created -> registered | failed`，之后任意状态 ->
 * `disposed`）：
 * - register()：仅允许从 `created` 进入。用 `instance.api` 构建 controller、
 *   注册全部核心 IPC handler，然后调用 `instance.start()`——handler 先于
 *   start 注册，因此 handler 注册失败不会留下任何 runtime 副作用。成功则进入
 *   `registered`，重复 register() 抛错；任何失败会逆向移除本次调用已安装的
 *   通道、best-effort dispose 实例（若 dispose 自身抛错则记录日志）、进入
 *   `failed` 并重新抛出原始错误。failed 的 handle 不得再次注册。
 * - destroy()：任何状态都允许，且始终幂等。处于 `failed` 的 handle 也是
 *   终态 no-op。对存活 handle，先移除全部核心通知通道，再把状态置为
 *   `disposed` 之后再调用 `instance.dispose()`，因此即使 dispose 抛错（该错误
 *   可向外传播），重入/重试 destroy 仍为 no-op。
 */

import { ipcMain } from 'electron';
import { NotificationChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import {
  CreateNotificationSchema,
  DeleteNotificationInvocationSchema,
  MarkAllNotificationsReadInvocationSchema,
  MarkNotificationReadInvocationSchema,
  NotificationBatchInvocationSchema,
  UpdateNotificationPreferenceSchema,
} from '@memoflow/contracts/notification';
import { createLogger } from '@memoflow/utils/logger';
import type { NotificationModuleInstance } from '../server/infrastructure';
import { NotificationController } from '../server/transport';
import {
  withAuthenticatedIdentity,
  withAuthenticatedValidation,
  withAuthenticatedValue,
} from './authenticated-ipc';

/**
 * Registers an object-payload IPC channel with adapter-owned validation.
 *
 * The returned handler runs inside the authenticated context, projects the
 * wire payload into the canonical contract input, validates it via the real
 * `ipcAdapterWithValidation`, and only then calls the controller. This is the
 * notification-module registration fixture — it is NOT a parallel validation
 * helper.
 *
 * 注册带 adapter 校验的 object-payload IPC 通道：handler 在鉴权 context 内把
 * wire payload 投影为 canonical contract 输入，经真实
 * `ipcAdapterWithValidation` 校验后才调用 controller。这是 notification 模块
 * 的注册 fixture，不是平行 validation helper。
 */
function registerValidatedChannel<TInput, TOutput>(
  ctx: IElectronModuleContext,
  channel: string,
  schema: ZodLikeSchema<TInput>,
  controllerFn: (
    data: TInput,
    context: import('@memoflow/contracts/shared').ExecutionContext,
  ) => Promise<import('@memoflow/contracts/result').Result<TOutput>>,
  projectArgs?: (args: unknown) => unknown,
): void {
  ipcMain.handle(channel, (event, args) =>
    withAuthenticatedValidation(ctx, schema, controllerFn, projectArgs)(event, args),
  );
}

/** Minimal structural schema interface (avoid hard Zod dependency in the seam). */
interface ZodLikeSchema<TInput> {
  safeParse(
    data: unknown,
  ):
    | { success: true; data: TInput }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
}

const logger = createLogger('NotificationElectron');

/**
 * Core channels installed by this handle. Custom-renderer channels are owned by
 * the desktop `custom-notification.manager` and deliberately excluded.
 *
 * 本 handle 安装的核心通道。custom-renderer 通道归属桌面
 * `custom-notification.manager`，刻意不在此列。
 */
const coreChannels = [
  NotificationChannels.LIST,
  NotificationChannels.GET,
  NotificationChannels.CREATE,
  NotificationChannels.MARK_READ,
  NotificationChannels.MARK_ALL_READ,
  NotificationChannels.DELETE,
  NotificationChannels.CLEAR_ALL,
  NotificationChannels.GET_UNREAD_COUNT,
  NotificationChannels.PREFERENCES_GET,
  NotificationChannels.PREFERENCES_UPDATE,
] as const;

/**
 * Custom-renderer channels owned by the desktop custom-notification.manager.
 * Referenced here to document ownership; this handle never installs or removes
 * them. Kept as a single source of truth for the surface spec.
 *
 * custom-renderer 通道归属桌面 custom-notification.manager。在此引用仅为记录
 * 归属；本 handle 绝不安装或移除它们。作为 surface spec 的唯一事实来源保留。
 */
export const notificationCustomRendererChannels = [
  NotificationChannels.CUSTOM_RECEIVE,
  NotificationChannels.CUSTOM_CLICK,
  NotificationChannels.CUSTOM_CLOSE,
  NotificationChannels.CUSTOM_RESIZE,
  NotificationChannels.CUSTOM_MOUSE_ENTER,
  NotificationChannels.CUSTOM_MOUSE_LEAVE,
  NotificationChannels.CUSTOM_RENDERER_READY,
] as const;

/**
 * Per-handle lifecycle state. Only 'created' may enter 'registered' (or
 * 'failed' on a registration error); any state may end in 'disposed'.
 *
 * 每个 handle 的生命周期状态。只有 'created' 可以进入 'registered'
 * （或注册失败时进入 'failed'）；任意状态都可以结束于 'disposed'。
 */
type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

/**
 * Notification Electron module handle.
 * 通知 Electron 模块 handle。
 *
 * Structurally compatible with `IElectronModule` from
 * `@memoflow/contracts/electron`, but defined locally so this seam stays
 * host-shaped: the factory returns it already bound to one instance.
 *
 * 与 `@memoflow/contracts/electron` 的 `IElectronModule` 结构兼容，
 * 但在本地定义，使该 seam 保持宿主形状：工厂返回时已绑定到单个实例。
 */
export interface NotificationElectronModuleDef {
  readonly name: string;
  /** Notification-owned stable delivery preference portability capability. */
  readonly portableCapability: NotificationModuleInstance['portableCapability'];
  register(context: IElectronModuleContext): void;
  destroy?(): void;
}

/**
 * Options carrying the already-assembled notification instance.
 * 携带已装配通知实例的选项。
 */
export interface NotificationElectronModuleOptions {
  readonly instance: NotificationModuleInstance;
}

/**
 * Creates the notification Electron transport module handle.
 * 创建通知 Electron 传输模块 handle。
 *
 * Turns an already-assembled `NotificationModuleInstance` into an
 * `IElectronModule`-compatible handle. The handle is a transport adapter, not a
 * composition root: it only registers IPC channels and owns start/dispose
 * lifecycle. IPC channel names, payload schemas, controller methods and
 * response envelopes are unchanged — see the handler registrations below.
 *
 * 把已装配的 `NotificationModuleInstance` 变成兼容 `IElectronModule` 的 handle。
 * 该 handle 是传输适配器而非组合根：只注册 IPC 通道并托管 start/dispose
 * 生命周期。IPC 通道名、payload schema、controller 方法与响应信封均保持不变——
 * 见下方各 handler 注册。
 *
 * @param options - Options carrying the assembled notification instance.
 * @returns An IElectronModule-compatible handle bound to the instance.
 */
export function createNotificationElectronModule(
  options: NotificationElectronModuleOptions,
): NotificationElectronModuleDef {
  if (!options?.instance) {
    throw new Error('[FAIL-CLOSED] createNotificationElectronModule requires options.instance');
  }
  let state: ModuleHandleState = 'created';

  return {
    name: 'Notification',
    portableCapability: options.instance.portableCapability,

    register(ctx: IElectronModuleContext): void {
      if (state !== 'created') {
        throw new Error(
          `NotificationElectronModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const installed: string[] = [];

      try {
        const controller = new NotificationController(options.instance.api);

        // 1. Core IPC Handlers — preserve all existing core channels.
        //    核心 IPC 处理器 — 保留所有现有核心通道。
        ipcMain.handle(NotificationChannels.LIST, async (_, params) => {
          return withAuthenticatedValue(ctx, (requestContext) =>
            controller.list(
              {
                ...(params ?? {}),
              },
              requestContext,
            ),
          );
        });
        installed.push(NotificationChannels.LIST);
        ipcMain.handle(NotificationChannels.GET, (_, id) =>
          withAuthenticatedValue(ctx, (requestContext) => controller.get(id, requestContext)),
        );
        installed.push(NotificationChannels.GET);
        registerValidatedChannel(
          ctx,
          NotificationChannels.CREATE,
          CreateNotificationSchema,
          (data, requestContext) => controller.create(data, requestContext),
        );
        installed.push(NotificationChannels.CREATE);
        registerValidatedChannel(
          ctx,
          NotificationChannels.MARK_READ,
          MarkNotificationReadInvocationSchema,
          (data, requestContext) => controller.markAsRead(data.params.id, requestContext),
          (args) => ({ params: { id: (args as { id?: string }).id ?? (args as string) } }),
        );
        installed.push(NotificationChannels.MARK_READ);
        registerValidatedChannel(
          ctx,
          NotificationChannels.MARK_ALL_READ,
          MarkAllNotificationsReadInvocationSchema,
          (_data, requestContext) => controller.markAllAsRead(requestContext.identityId),
          (args) => args,
        );
        installed.push(NotificationChannels.MARK_ALL_READ);
        registerValidatedChannel(
          ctx,
          NotificationChannels.DELETE,
          DeleteNotificationInvocationSchema,
          async (data, requestContext) => {
            const result = await controller.delete(data.params.id, requestContext);
            if (!result.ok) return result;
            return ok(null);
          },
          (args) => ({ params: { id: (args as { id?: string }).id ?? (args as string) } }),
        );
        installed.push(NotificationChannels.DELETE);
        registerValidatedChannel(
          ctx,
          NotificationChannels.CLEAR_ALL,
          NotificationBatchInvocationSchema,
          (data, requestContext) => controller.batchDelete(data, requestContext),
          (args) => ({ notificationIds: args as string[] }),
        );
        installed.push(NotificationChannels.CLEAR_ALL);
        ipcMain.handle(NotificationChannels.GET_UNREAD_COUNT, async () => {
          return withAuthenticatedIdentity(ctx, (identityId) =>
            controller.getUnreadCount(identityId),
          );
        });
        installed.push(NotificationChannels.GET_UNREAD_COUNT);
        ipcMain.handle(NotificationChannels.PREFERENCES_GET, async () => {
          return withAuthenticatedValue(ctx, (requestContext) =>
            controller.getPreferences(requestContext),
          );
        });
        installed.push(NotificationChannels.PREFERENCES_GET);
        registerValidatedChannel(
          ctx,
          NotificationChannels.PREFERENCES_UPDATE,
          UpdateNotificationPreferenceSchema,
          (data, requestContext) => controller.updatePreferences(data, requestContext),
          (args) => args ?? {},
        );
        installed.push(NotificationChannels.PREFERENCES_UPDATE);

        options.instance.start();
        state = 'registered';

        logger.info('Notification module registered');
      } catch (error) {
        state = 'failed';
        for (let i = installed.length - 1; i >= 0; i--) {
          ipcMain.removeHandler(installed[i]);
        }
        try {
          options.instance.dispose();
        } catch (disposeError) {
          logger.error(
            'NotificationElectron: instance dispose failed during failed registration',
            disposeError,
          );
        }
        throw error;
      }
    },

    destroy(): void {
      if (state === 'disposed' || state === 'failed') {
        return;
      }

      // Only remove the core channels this handle installed. Custom-renderer
      // channels remain owned by the desktop custom-notification.manager.
      // 只移除本 handle 安装的核心通道。custom-renderer 通道仍归属桌面
      // custom-notification.manager。
      for (const ch of coreChannels) {
        ipcMain.removeHandler(ch);
      }
      state = 'disposed';

      options.instance.dispose();
      logger.info('Notification module destroyed');
    },
  };
}
