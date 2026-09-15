/**
 * Data Portability Electron composition root — desktop lane host runtime.
 * 数据导出导入 Electron 组合根 —— desktop lane 宿主运行时。
 *
 * This is the desktop-lane composition root for data-portability. The desktop
 * main runtime owns the per-profile PowerSync database (IElectronDatabase), so
 * it selects the complete cross-module export dependency set and the PowerSync
 * import store, assembles the transport-neutral `DataPortabilityModuleInstance`,
 * and turns it into an already-bound `IElectronModule`-compatible handle via
 * `createDataPortabilityElectronModule`.
 *
 * 这是数据导出导入在 desktop lane 的组合根。桌面主进程运行时拥有按 profile 划分的
 * PowerSync 数据库（IElectronDatabase），因此由它选择完整的跨模块导出依赖集合与
 * PowerSync import store，装配与传输无关的 `DataPortabilityModuleInstance`，再通过
 * `createDataPortabilityElectronModule` 变成已绑定 instance 的、兼容
 * `IElectronModule` 的 module handle。
 *
 * Assembly order (plan §3.3) — MUST be: runtime db → complete PowerSync export
 * dependency set → PowerSync import store → module instance → Electron module.
 * This keeps the dependency direction explicit: the host picks adapters, the
 * data-portability deep module stays transport-agnostic, and the returned
 * handle only registers transport + lifecycle.
 *
 * 组装顺序（计划 §3.3）必须为：runtime db → 完整 PowerSync 导出依赖集合 →
 * PowerSync import store → module instance → Electron module。这使依赖方向显式化：
 * 宿主选择适配器，data-portability 深模块保持与传输无关，返回的 handle 只负责
 * transport 注册与生命周期。
 */

import type { PortableCapability } from '@memoflow/contracts/data-portability';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import {
  createDataPortabilityModule,
  createPowerSyncDataPortabilityDependencies,
  createPowerSyncDataPortabilityImportStore,
} from '@memoflow/data-portability';
import {
  createDataPortabilityElectronModule,
  type DataPortabilityElectronModuleDef,
} from '@memoflow/data-portability/electron';

/**
 * Dependencies the data-portability composer needs from the desktop host runtime.
 * 数据导出导入 composer 需要从 desktop 宿主运行时拿到的依赖。
 */
export interface ComposeDataPortabilityDesktopDependencies {
  /** PowerSync-backed desktop business database owned by the desktop main runtime. 桌面主进程持有的 PowerSync 桌面业务数据库。 */
  readonly db: IElectronDatabase;
  /** Owner-provided V3 capability seams; product IPC remains V2 until full owner coverage. */
  readonly portableCapabilities?: readonly PortableCapability<unknown>[];
}

/**
 * Composes the data-portability Electron module handle from the desktop runtime's database.
 * 用 desktop runtime 的数据库组装数据导出导入 Electron module handle。
 *
 * Wire order:
 * 1. createPowerSyncDataPortabilityDependencies(db) — select the complete
 *    cross-module export dependency set (PowerSync adapters).
 * 2. createPowerSyncDataPortabilityImportStore(db) — build the PowerSync import store.
 * 3. createDataPortabilityModule({ exportDependencies, importStore }) — assemble
 *    the transport-neutral data-portability instance.
 * 4. createDataPortabilityElectronModule({ instance }) — bind the instance to an
 *    IElectronModule handle (transport + lifecycle only).
 *
 * 接线顺序：
 * 1. createPowerSyncDataPortabilityDependencies(db) —— 选择完整的跨模块导出依赖集合
 *    （PowerSync 适配器）。
 * 2. createPowerSyncDataPortabilityImportStore(db) —— 构建 PowerSync import store。
 * 3. createDataPortabilityModule({ exportDependencies, importStore }) —— 装配与
 *    传输无关的数据导出导入实例。
 * 4. createDataPortabilityElectronModule({ instance }) —— 把实例绑定到
 *    IElectronModule handle（只负责 transport 与生命周期）。
 *
 * The returned handle is already fully bound: ElectronBootstrapper.register()
 * must be called with it once, and its destroy() disposes the owned instance.
 *
 * 返回的 handle 已完全绑定：ElectronBootstrapper.register() 必须恰好注册一次，
 * 其 destroy() 会 dispose 所属实例。
 *
 * @param dependencies - ComposeDataPortabilityDesktopDependencies with the runtime Electron database.
 * @returns DataPortabilityElectronModuleDef — an already-bound IElectronModule-compatible handle.
 */
export function composeDataPortability(
  dependencies: ComposeDataPortabilityDesktopDependencies,
): DataPortabilityElectronModuleDef {
  const exportDependencies = createPowerSyncDataPortabilityDependencies(dependencies.db);
  const importStore = createPowerSyncDataPortabilityImportStore(dependencies.db);

  const instance = createDataPortabilityModule({
    exportDependencies,
    importStore,
    portableCapabilities: dependencies.portableCapabilities,
  });

  return createDataPortabilityElectronModule({ instance });
}
