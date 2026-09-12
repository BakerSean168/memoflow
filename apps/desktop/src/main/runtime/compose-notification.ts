/**
 * Notification Electron composition root — desktop lane host runtime.
 * 通知 Electron 组合根 —— desktop lane 宿主运行时。
 *
 * This is the desktop-lane composition root for notification. The desktop main
 * runtime owns the per-profile PowerSync database (IElectronDatabase), so it
 * selects the PowerSync persistence adapters, builds the module-owned durable
 * runtime from an EXPLICIT host capability list (InApp + Desktop channels and
 * the native Electron desktop transport — never a silently-decided default),
 * and assembles the transport-neutral `NotificationModuleInstance`. The instance
 * is then bound to an `IElectronModule`-compatible handle via
 * `createNotificationElectronModule`.
 *
 * 这是通知在 desktop lane 的组合根。桌面主进程运行时拥有按 profile 划分的
 * PowerSync 数据库（IElectronDatabase），因此由它选择 PowerSync 持久化适配器、
 * 依据显式的宿主能力列表（InApp + Desktop 通道与原生 Electron desktop transport
 * ——绝不静默决定默认能力列表）构建模块自有 durable runtime，并装配与传输无关的
 * `NotificationModuleInstance`。实例随后通过 `createNotificationElectronModule`
 * 绑定为兼容 `IElectronModule` 的 handle。
 *
 * NOTIF-3302 removes the scheduler-facing NotificationPort from desktop host
 * composition. The closure checker
 * is a host port built from the profile DB via `createPowerSyncClosureChecker`
 * and passed explicitly — fail-closed on closed accounts.
 *
 * NOTIF-3302 后 desktop host 不再组装 scheduler-facing NotificationPort。closure checker 是宿主持有
 * 的 Port，通过 `createPowerSyncClosureChecker` 基于 profile DB 构建并显式传入——
 * 对已关闭账户 fail-closed。
 *
 * Assembly order (plan §3.3) — MUST be: runtime db → notification PowerSync
 * repository set → durable runtime (explicit channel capabilities + transport)
 * → notification instance → Electron module.
 *
 * 组装顺序（计划 §3.3）必须为：runtime db → 通知 PowerSync 仓储集合 → durable
 * runtime（显式 channel capabilities + transport）→ notification instance → Electron module。
 */

import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { UserTimeContextPort } from '@memoflow/time';
import {
  createDefaultElectronDesktopTransport,
  createNotificationDurableRuntime,
  createNotificationModule,
  createNotificationPowerSyncRepositories,
  createPowerSyncClosureChecker,
  type ChannelCapabilitySpec,
  type INotificationRepository,
  type NotificationRequestedWriterPort,
} from '@memoflow/notification';
import {
  createNotificationElectronModule,
  type NotificationElectronModuleDef,
} from '@memoflow/notification/electron';

/**
 * Dependencies the notification composer needs from the desktop host runtime.
 * 通知 composer 需要从 desktop 宿主运行时拿到的依赖。
 */
export interface ComposeNotificationDesktopDependencies {
  /** PowerSync-backed desktop business database owned by the desktop main runtime. 桌面主进程持有的 PowerSync 桌面业务数据库。 */
  readonly db: IElectronDatabase;
  readonly userTimeContextPort: UserTimeContextPort;
  /** Explicit channel capabilities selected by the host (InApp + Desktop). 宿主显式选择的 channel capabilities（InApp + Desktop）。 */
  readonly channelCapabilities: readonly ChannelCapabilitySpec[];
  /** Native Electron desktop transport (acks + native Notification side effect). 原生 Electron desktop transport（ack + 原生 Notification 副作用）。 */
  readonly desktopTransport?: unknown;
  /** Late-bound device renderer used by the durable Desktop transport. */
  readonly desktopRenderer?: (dto: unknown, context?: unknown) => boolean | Promise<boolean>;
}

/**
 * Composed notification surface for the desktop host.
 * 通知在 desktop 宿主的组装结果。
 */
export interface ComposedNotificationDesktop {
  /** Already-bound IElectronModule-compatible handle. 已绑定的 IElectronModule 兼容 handle。 */
  readonly module: NotificationElectronModuleDef;
  /** Repository view exposed to sibling modules (dashboard). 暴露给兄弟模块（dashboard）的仓储视图。 */
  readonly repositories: {
    readonly notificationRepository: INotificationRepository;
    /** Durable NotificationRequested writer (NOTIF-3301) for business handlers. */
    readonly requestedWriter: NotificationRequestedWriterPort;
  };
  /** Trusted writer for durable `notification.requested` envelopes (cross-module consumption). 可信的 durable `notification.requested` 信封写入器（跨模块消费）。 */
  readonly requestedWriter: NotificationRequestedWriterPort;
}

/**
 * Composes the notification Electron module handle from the desktop runtime's database.
 * 用 desktop runtime 的数据库组装通知 Electron module handle。
 *
 * Wire order:
 * 1. createNotificationPowerSyncRepositories(db) — select the PowerSync adapters.
 * 2. createNotificationDurableRuntime({ notificationRepository, reliableAdapter,
 *    channelCapabilities, transport }) — build the module-owned durable runtime
 *    from the host capability selection (explicit InApp + Desktop + native
 *    transport, matching the historical desktop default exactly).
 * 3. createNotificationModule({ ...repositories, closureChecker, durableRuntime,
 *    runtimeContributions: [durableRuntime], db }) — assemble the
 *    transport-neutral notification instance (fail-closed closure checker).
 * 4. createNotificationElectronModule({ instance }) — bind the instance to an
 *    IElectronModule handle (transport + lifecycle only).
 *
 * 接线顺序：
 * 1. createNotificationPowerSyncRepositories(db) —— 选择 PowerSync 适配器。
 * 2. createNotificationDurableRuntime({ notificationRepository, reliableAdapter,
 *    channelCapabilities, transport }) —— 依据宿主能力选择构建模块自有 durable
 *    runtime（显式 InApp + Desktop + 原生 transport，与历史桌面默认完全一致）。
 * 3. createNotificationModule({ ...repositories, closureChecker, durableRuntime,
 *    runtimeContributions: [durableRuntime], db }) —— 装配与传输无关的通知实例
 *    （fail-closed closure checker）。
 * 4. createNotificationElectronModule({ instance }) —— 把实例绑定到 IElectronModule
 *    handle（只负责 transport 与生命周期）。
 *
 * The returned handle is already fully bound: ElectronBootstrapper.register()
 * must be called with it once, and its destroy() disposes the owned instance.
 *
 * 返回的 handle 已完全绑定：ElectronBootstrapper.register() 必须恰好注册一次，
 * 其 destroy() 会 dispose 所属实例。
 *
 * @param dependencies - ComposeNotificationDesktopDependencies with the runtime Electron database and host ports.
 * @returns ComposedNotificationDesktop — the bound module handle plus durable requestedWriter access.
 */
export function composeNotification(
  dependencies: ComposeNotificationDesktopDependencies,
): ComposedNotificationDesktop {
  const repositories = createNotificationPowerSyncRepositories(dependencies.db);

  const closureChecker = createPowerSyncClosureChecker(dependencies.db);

  const durableRuntime = createNotificationDurableRuntime({
    notificationRepository: repositories.notificationRepository,
    preferenceRepository: repositories.notificationPreferenceRepository,
    closureChecker,
    userTimeContextPort: dependencies.userTimeContextPort,
    reliableAdapter: repositories.reliableAdapter,
    channelCapabilities: Array.from(dependencies.channelCapabilities),
    transport:
      dependencies.desktopTransport ??
      createDefaultElectronDesktopTransport({
        db: dependencies.db,
        renderer: dependencies.desktopRenderer,
      }),
  });


  const instance = createNotificationModule({
    notificationRepository: repositories.notificationRepository,
    preferenceRepository: repositories.notificationPreferenceRepository,
    templateRepository: repositories.notificationTemplateRepository,
    closureChecker,
    userTimeContextPort: dependencies.userTimeContextPort,
    durableRuntime,
    runtimeContributions: [durableRuntime],
  });

  return {
    module: createNotificationElectronModule({ instance }),
    repositories: {
      notificationRepository: repositories.notificationRepository,
      requestedWriter: repositories.requestedWriter,
    },
    requestedWriter: repositories.requestedWriter,
  };
}
