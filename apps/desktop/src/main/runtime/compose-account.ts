/**
 * Account Electron composition root — desktop lane host runtime.
 * 账户 Electron 组合根 —— desktop lane 宿主运行时。
 *
 * This is the desktop-lane composition root for account. The desktop main
 * runtime owns the per-profile PowerSync database (IElectronDatabase), so it
 * selects the PowerSync persistence adapter, builds the module-owned runtime
 * contributions, assembles the transport-neutral `AccountModuleInstance`, and
 * turns it into an already-bound `IElectronModule`-compatible handle via
 * `createAccountElectronModule`. It also returns the instance-bound account
 * repository so desktop consumers (profile sync / local account bootstrap)
 * read through explicit ports instead of package globals.
 *
 * 这是账户在 desktop lane 的组合根。桌面主进程运行时拥有按 profile 划分的
 * PowerSync 数据库（IElectronDatabase），因此由它选择 PowerSync 持久化适配器、
 * 构建模块自有运行时贡献、装配与传输无关的 `AccountModuleInstance`，再通过
 * `createAccountElectronModule` 变成已绑定 instance 的、兼容 `IElectronModule`
 * 的 module handle。它还返回 instance-bound 的账户 repository，使桌面消费者
 * （profile sync / 本地账户引导）通过显式 port 读取，而不依赖包级全局。
 *
 * Desktop delegates account closure to the Cloud API, so the closure
 * coordinator / revocation port are deliberately absent here — the set only
 * carries the account repository (`AccountPowerSyncRepositorySet`).
 * `syncOptions` stays host-owned because its cloud close / profile callbacks are
 * built in apps/desktop/src/main/main.ts; when present, this composer builds
 * the `DesktopAccountProfileSync` profile-sync bridge from the SAME repository
 * instance and passes both back to the transport module.
 *
 * 桌面 lane 将账户关闭委托给 Cloud API，因此这里刻意没有 closure coordinator /
 * revocation port——集合只携带账户 repository（`AccountPowerSyncRepositorySet`）。
 * `syncOptions` 保持宿主所有，因为它的 cloud close / profile 回调构建于
 * apps/desktop/src/main/main.ts；提供时，本 composer 从同一 repository 实例
 * 构建 `DesktopAccountProfileSync` profile-sync 桥，并把两者一并传给传输模块。
 *
 * Assembly order (plan §3.3) — MUST be: runtime db → account PowerSync
 * repository set → module-owned runtime contributions → account instance →
 * (profile sync bridge) → Electron module. This keeps the dependency direction
 * explicit: the host picks adapters, the account deep module stays
 * transport-agnostic, and the returned handle only registers transport +
 * lifecycle.
 *
 * 组装顺序（计划 §3.3）必须为：runtime db → 账户 PowerSync 仓储集合 → 模块自有
 * 运行时贡献 → account instance →（profile sync 桥）→ Electron module。这使依赖
 * 方向显式化：宿主选择适配器，account 深模块保持与传输无关，返回的 handle 只
 * 负责 transport 注册与生命周期。
 */

import type { IElectronDatabase } from '@memoflow/contracts/electron';
import {
  createAccountModule,
  createAccountPowerSyncRepositories,
  createAccountRuntimeContributions,
  type AccountRuntimeContributionsInput,
  type IAccountRepository,
} from '@memoflow/account';
import type { Clock } from '@memoflow/time';
import {
  createAccountElectronModule,
  DesktopAccountProfileSync,
  type AccountElectronModuleDef,
  type DesktopAccountProfileSyncOptions,
} from '@memoflow/account/electron';

/**
 * Dependencies the account composer needs from the desktop host runtime.
 * 账户 composer 需要从 desktop 宿主运行时拿到的依赖。
 */
export interface ComposeAccountDesktopDependencies {
  /** PowerSync-backed desktop business database owned by the desktop main runtime. 桌面主进程持有的 PowerSync 桌面业务数据库。 */
  readonly db: IElectronDatabase;
  /** Host-owned Product Time clock for Account mutations. */
  readonly clock: Clock;
  /** Host-owned cloud-close / profile-sync callbacks (built in main.ts). 宿主持有的 cloud-close / profile-sync 回调（构建于 main.ts）。 */
  readonly syncOptions?: DesktopAccountProfileSyncOptions;
  /** Extra runtime contributions from the host. 宿主提供的额外运行时贡献。 */
  readonly runtimeContributions?: AccountRuntimeContributionsInput;
}

/**
 * Composed account Electron module handle plus the instance-bound repository view.
 * 组装好的账户 Electron module handle 以及 instance-bound repository view。
 */
export interface ComposedAccountDesktop {
  /** Already-bound IElectronModule-compatible handle. 已绑定的兼容 IElectronModule 的 handle。 */
  readonly module: AccountElectronModuleDef;
  /** Instance-bound account repository for desktop consumers. 供 desktop 消费者使用的 instance-bound 账户 repository。 */
  readonly repositories: {
    readonly accountRepository: IAccountRepository;
  };
}

/**
 * Composes the account Electron module handle from the desktop runtime's database.
 * 用 desktop runtime 的数据库组装账户 Electron module handle。
 *
 * Wire order:
 * 1. createAccountPowerSyncRepositories(db) — select the PowerSync adapter.
 * 2. createAccountRuntimeContributions(accountRepository, extra) — build the
 *    module-owned runtime contributions.
 * 3. createAccountModule({ accountRepository, laneCapability: 'desktop',
 *    runtimeContributions }) — assemble the transport-neutral account instance.
 * 4. When syncOptions is present: new DesktopAccountProfileSync(db,
 *    accountRepository, instance.useCases.updateProfile, syncOptions) — build the
 *    profile-sync bridge from the SAME repository instance.
 * 5. createAccountElectronModule({ instance, syncOptions, profileSync }) — bind
 *    the instance to an IElectronModule handle (transport + lifecycle only).
 *
 * 接线顺序：
 * 1. createAccountPowerSyncRepositories(db) —— 选择 PowerSync 适配器。
 * 2. createAccountRuntimeContributions(accountRepository, extra) —— 构建模块自有
 *    运行时贡献。
 * 3. createAccountModule({ accountRepository, laneCapability: 'desktop',
 *    runtimeContributions }) —— 装配与传输无关的账户实例。
 * 4. 提供 syncOptions 时：new DesktopAccountProfileSync(db, accountRepository,
 *    instance.useCases.updateProfile, syncOptions) —— 从同一 repository 实例构建
 *    profile-sync 桥。
 * 5. createAccountElectronModule({ instance, syncOptions, profileSync }) —— 把
 *    实例绑定到 IElectronModule handle（只负责 transport 与生命周期）。
 *
 * The returned handle is already fully bound: ElectronBootstrapper.register()
 * must be called with it once, and its destroy() disposes the owned instance.
 * The returned repository view stays valid for the lifetime of that handle.
 *
 * 返回的 handle 已完全绑定：ElectronBootstrapper.register() 必须恰好注册一次，
 * 其 destroy() 会 dispose 所属实例。返回的 repository view 在该 handle 存续期间
 * 始终有效。
 *
 * @param dependencies - ComposeAccountDesktopDependencies with the runtime Electron database.
 * @returns ComposedAccountDesktop — the bound Electron module handle plus repository view.
 */
export function composeAccount(
  dependencies: ComposeAccountDesktopDependencies,
): ComposedAccountDesktop {
  const { accountRepository } = createAccountPowerSyncRepositories(dependencies.db);

  const instance = createAccountModule({
    accountRepository,
    clock: dependencies.clock,
    laneCapability: 'desktop',
    runtimeContributions: createAccountRuntimeContributions(
      accountRepository,
      dependencies.runtimeContributions,
    ),
  });

  const profileSync = dependencies.syncOptions
    ? new DesktopAccountProfileSync(
        dependencies.db,
        accountRepository,
        instance.useCases.updateProfile,
        dependencies.syncOptions,
      )
    : undefined;

  return {
    module: createAccountElectronModule({
      instance,
      syncOptions: dependencies.syncOptions,
      profileSync,
    }),
    repositories: {
      accountRepository,
    },
  };
}
