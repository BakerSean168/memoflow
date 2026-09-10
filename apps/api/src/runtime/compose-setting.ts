/**
 * Setting API composition root — API lane host runtime.
 * 设置 API 组合根 —— API lane 宿主运行时。
 *
 * This is the API-lane composition root for setting. The API runtime owns the
 * shared Prisma connection (created in main.ts by connectDatabase()), so it
 * selects the Prisma persistence adapter, builds the module-owned runtime
 * contribution, and assembles the transport-neutral `SettingModuleInstance`.
 * The instance is then bound to an `IApiModule`-compatible handle via
 * `createSettingApiModule`.
 *
 * 这是设置在 API lane 的组合根。API runtime 拥有共享的 Prisma 连接
 * （由 main.ts 的 connectDatabase() 创建），因此由它选择 Prisma 持久化适配器、
 * 构建模块自有运行时贡献，并装配与传输无关的 `SettingModuleInstance`。实例随后
 * 通过 `createSettingApiModule` 绑定为兼容 `IApiModule` 的 handle。
 *
 * Assembly order (plan §3.3) — MUST be: runtime db → setting repository set →
 * module-owned runtime contribution → setting instance → API module. This keeps
 * the dependency direction explicit: the host picks adapters, the setting deep
 * module stays transport-agnostic, and the returned handle only registers
 * transport + lifecycle.
 *
 * 组装顺序（计划 §3.3）必须为：runtime db → 设置仓储集合 → 模块自有运行时贡献 →
 * setting instance → API module。这使依赖方向显式化：宿主选择适配器，setting 深
 * 模块保持与传输无关，返回的 handle 只负责 transport 注册与生命周期。
 *
 * Deliberately narrow interface: setting consumes only the `db` Prisma
 * capability, so the composer accepts exactly that and nothing more.
 *
 * 刻意保持窄接口：设置只消费 `db` Prisma capability，因此本 composer 恰好接受
 * 这一个依赖，不多不少。
 */

import type { PrismaClient } from '@memoflow/database';
import {
  createSettingModule,
  createSettingPrismaRepositories,
  createSettingRuntimeContribution,
} from '@memoflow/setting';
import {
  createSettingApiModule,
  type SettingApiModuleDef,
} from '@memoflow/setting/api';

/**
 * Dependencies the setting composer needs from the API host runtime.
 * 设置 composer 需要从 API 宿主运行时拿到的依赖。
 */
export interface ComposeSettingDependencies {
  /** Shared API-lane Prisma client owned by apps/api. 由 apps/api 持有的共享 API lane Prisma client。 */
  readonly db: PrismaClient;
}

/**
 * Composes the setting API module handle from the API runtime's Prisma client.
 * 用 API runtime 的 Prisma client 组装设置 API module handle。
 *
 * Wire order:
 * 1. createSettingPrismaRepositories(db) — select the Prisma adapter.
 * 2. createSettingRuntimeContribution() — build the module-owned runtime
 *    contribution.
 * 3. createSettingModule({ userSettingRepository, runtimeContributions }) —
 *    assemble the transport-neutral setting instance.
 * 4. createSettingApiModule({ instance }) — bind the instance to an IApiModule
 *    handle (transport + lifecycle only).
 *
 * 接线顺序：
 * 1. createSettingPrismaRepositories(db) —— 选择 Prisma 适配器。
 * 2. createSettingRuntimeContribution() —— 构建模块自有运行时贡献。
 * 3. createSettingModule({ userSettingRepository, runtimeContributions })
 *    —— 装配与传输无关的设置实例。
 * 4. createSettingApiModule({ instance }) —— 把实例绑定到 IApiModule handle
 *    （只负责 transport 与生命周期）。
 *
 * The returned handle is already fully bound: ApiBootstrapper.register() must
 * be called with it once, and its destroy() disposes the owned instance.
 *
 * 返回的 handle 已完全绑定：ApiBootstrapper.register() 必须恰好注册一次，
 * 其 destroy() 会 dispose 所属实例。
 *
 * @param dependencies - ComposeSettingDependencies with the runtime Prisma client.
 * @returns SettingApiModuleDef — an already-bound IApiModule-compatible handle.
 */
export function composeSetting(
  dependencies: ComposeSettingDependencies,
): SettingApiModuleDef {
  const { userSettingRepository, userPreferenceRepository } =
    createSettingPrismaRepositories(dependencies.db);

  const instance = createSettingModule({
    userSettingRepository,
    userPreferenceRepository,
    runtimeContributions: [createSettingRuntimeContribution()],
  });

  return createSettingApiModule({ instance });
}
