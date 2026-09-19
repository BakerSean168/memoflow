/**
 * Setting Electron composition root — desktop lane host runtime.
 * 设置 Electron 组合根 —— desktop lane 宿主运行时。
 *
 * This is the desktop-lane composition root for setting. The desktop main
 * runtime owns the per-profile PowerSync database (IElectronDatabase), so it
 * selects the PowerSync persistence adapter, builds the module-owned runtime
 * contribution, assembles the transport-neutral `SettingModuleInstance`, and
 * turns it into an already-bound `IElectronModule`-compatible handle via
 * `createSettingElectronModule`.
 *
 * 这是设置在 desktop lane 的组合根。桌面主进程运行时拥有按 profile 划分的
 * PowerSync 数据库（IElectronDatabase），因此由它选择 PowerSync 持久化适配器、
 * 构建模块自有运行时贡献、装配与传输无关的 `SettingModuleInstance`，再通过
 * `createSettingElectronModule` 变成已绑定 instance 的、兼容 `IElectronModule`
 * 的 module handle。
 *
 * Assembly order (plan §3.3) — MUST be: runtime db → setting PowerSync
 * repository set → module-owned runtime contribution → setting instance →
 * Electron module. This keeps the dependency direction explicit: the host picks
 * adapters, the setting deep module stays transport-agnostic, and the returned
 * handle only registers transport + lifecycle.
 *
 * 组装顺序（计划 §3.3）必须为：runtime db → 设置 PowerSync 仓储集合 → 模块自有
 * 运行时贡献 → setting instance → Electron module。这使依赖方向显式化：宿主选择
 * 适配器，setting 深模块保持与传输无关，返回的 handle 只负责 transport 注册与
 * 生命周期。
 *
 * Deliberately narrow interface: setting consumes only the `db` Electron
 * database capability, so the composer accepts exactly that and nothing more.
 *
 * 刻意保持窄接口：设置只消费 `db` Electron 数据库 capability，因此本 composer
 * 恰好接受这一个依赖，不多不少。
 */

import type { IElectronDatabase } from '@memoflow/contracts/electron';
import {
  createSettingModule,
  createSettingPowerSyncRepositories,
  createSettingRuntimeContribution,
} from '@memoflow/setting';
import {
  createSettingElectronModule,
  type SettingElectronModuleDef,
} from '@memoflow/setting/electron';

/**
 * Dependencies the setting composer needs from the desktop host runtime.
 * 设置 composer 需要从 desktop 宿主运行时拿到的依赖。
 */
export interface ComposeSettingDesktopDependencies {
  /** PowerSync-backed desktop business database owned by the desktop main runtime. 桌面主进程持有的 PowerSync 桌面业务数据库。 */
  readonly db: IElectronDatabase;
}

/**
 * Composes the setting Electron module handle from the desktop runtime's database.
 * 用 desktop runtime 的数据库组装设置 Electron module handle。
 *
 * Wire order:
 * 1. createSettingPowerSyncRepositories(db) — select the PowerSync adapter.
 * 2. createSettingRuntimeContribution() — build the module-owned runtime
 *    contribution.
 * 3. createSettingModule({ userPreferenceRepository, runtimeContributions }) —
 *    assemble the transport-neutral setting instance.
 * 4. createSettingElectronModule({ instance }) — bind the instance to an
 *    IElectronModule handle (transport + lifecycle only).
 *
 * 接线顺序：
 * 1. createSettingPowerSyncRepositories(db) —— 选择 PowerSync 适配器。
 * 2. createSettingRuntimeContribution() —— 构建模块自有运行时贡献。
 * 3. createSettingModule({ userPreferenceRepository, runtimeContributions })
 *    —— 装配与传输无关的设置实例。
 * 4. createSettingElectronModule({ instance }) —— 把实例绑定到 IElectronModule
 *    handle（只负责 transport 与生命周期）。
 *
 * The returned handle is already fully bound: ElectronBootstrapper.register()
 * must be called with it once, and its destroy() disposes the owned instance.
 *
 * 返回的 handle 已完全绑定：ElectronBootstrapper.register() 必须恰好注册一次，
 * 其 destroy() 会 dispose 所属实例。
 *
 * @param dependencies - ComposeSettingDesktopDependencies with the runtime Electron database.
 * @returns SettingElectronModuleDef — an already-bound IElectronModule-compatible handle.
 */
export function composeSetting(
  dependencies: ComposeSettingDesktopDependencies,
): SettingElectronModuleDef {
  const { userPreferenceRepository } = createSettingPowerSyncRepositories(dependencies.db);

  const instance = createSettingModule({
    userPreferenceRepository,
    runtimeContributions: [createSettingRuntimeContribution()],
  });

  return createSettingElectronModule({ instance });
}
