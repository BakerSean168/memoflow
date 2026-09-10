/**
 * Data Portability API composition root — API lane host runtime.
 * 数据导出导入 API 组合根 —— API lane 宿主运行时。
 *
 * This is the API-lane composition root for data-portability. The API runtime
 * owns the shared Prisma connection (created in main.ts by connectDatabase()),
 * so it selects the complete cross-module export dependency set, the Prisma
 * import store and the server-held disclosure application port, assembles the
 * transport-neutral `DataPortabilityModuleInstance`, and turns it into an
 * already-bound `IApiModule`-compatible handle via
 * `createDataPortabilityApiModule`.
 *
 * 这是数据导出导入在 API lane 的组合根。API runtime 拥有共享的 Prisma 连接
 * （由 main.ts 的 connectDatabase() 创建），因此由它选择完整的跨模块导出依赖集合、
 * Prisma import store 与 server-held disclosure 应用 port，装配与传输无关的
 * `DataPortabilityModuleInstance`，再通过 `createDataPortabilityApiModule`
 * 变成已绑定 instance 的、兼容 `IApiModule` 的 module handle。
 *
 * Assembly order (plan §3.3) — MUST be: runtime db → complete export dependency
 * set → Prisma import store → server-held disclosure port → module instance →
 * API module. This keeps the dependency direction explicit: the host picks
 * adapters, the data-portability deep module stays transport-agnostic, and the
 * returned handle only registers transport + lifecycle.
 *
 * 组装顺序（计划 §3.3）必须为：runtime db → 完整导出依赖集合 → Prisma import
 * store → server-held disclosure port → module instance → API module。
 * 这使依赖方向显式化：宿主选择适配器，data-portability 深模块保持与传输无关，
 * 返回的 handle 只负责 transport 注册与生命周期。
 *
 * The server-held disclosure application port is a route-level dependency of the
 * transport (`/data-portability` disclosure routes), so the composer returns it
 * alongside the module handle for explicit host ownership.
 *
 * server-held disclosure 应用 port 是传输层 `/data-portability` disclosure 路由
 * 的路由级依赖，因此 composer 在返回 module handle 的同时一并返回该 port，
 * 交由宿主显式持有。
 */

import type { PortableCapability } from '@memoflow/contracts/data-portability';
import type { PrismaClient } from '@memoflow/database';
import {
  createDataPortabilityModule,
  createPrismaDataPortabilityDependencies,
  createPrismaDataPortabilityImportStore,
  createPrismaServerHeldDataDisclosureApplicationPort,
  type ServerHeldDataDisclosureApplicationPort,
} from '@memoflow/data-portability';
import {
  createDataPortabilityApiModule,
  type DataPortabilityApiModuleDef,
} from '@memoflow/data-portability/api';

/**
 * Dependencies the data-portability composer needs from the API host runtime.
 * 数据导出导入 composer 需要从 API 宿主运行时拿到的依赖。
 */
export interface ComposeDataPortabilityDependencies {
  /** Shared API-lane Prisma client owned by apps/api. 由 apps/api 持有的共享 API lane Prisma client。 */
  readonly db: PrismaClient;
  /** Owner-provided V3 capability seams; product routes remain V2 until full owner coverage. */
  readonly portableCapabilities?: readonly PortableCapability<unknown>[];
}

/**
 * Composed data-portability surface for the API host.
 * 数据导出导入在 API 宿主的组装结果。
 */
export interface ComposedDataPortability {
  /** Already-bound IApiModule-compatible handle. 已绑定的 IApiModule 兼容 handle。 */
  readonly module: DataPortabilityApiModuleDef;
  /** Host-owned server-held disclosure application port used by the transport routes. 宿主持有的、传输路由使用的 server-held disclosure 应用 port。 */
  readonly serverHeldDataDisclosureApi: ServerHeldDataDisclosureApplicationPort;
}

/**
 * Composes the data-portability API module handle from the API runtime's Prisma client.
 * 用 API runtime 的 Prisma client 组装数据导出导入 API module handle。
 *
 * Wire order:
 * 1. createPrismaDataPortabilityDependencies(db) — select the complete
 *    cross-module export dependency set (Prisma adapters).
 * 2. createPrismaDataPortabilityImportStore(db) — build the Prisma import store.
 * 3. createPrismaServerHeldDataDisclosureApplicationPort(db) — build the
 *    server-held disclosure application port consumed by the disclosure routes.
 * 4. createDataPortabilityModule({ exportDependencies, importStore }) — assemble
 *    the transport-neutral data-portability instance.
 * 5. createDataPortabilityApiModule({ instance, serverHeldDataDisclosureApi })
 *    — bind the instance + disclosure port to an IApiModule handle
 *    (transport + lifecycle only).
 *
 * 接线顺序：
 * 1. createPrismaDataPortabilityDependencies(db) —— 选择完整的跨模块导出依赖集合
 *    （Prisma 适配器）。
 * 2. createPrismaDataPortabilityImportStore(db) —— 构建 Prisma import store。
 * 3. createPrismaServerHeldDataDisclosureApplicationPort(db) —— 构建 disclosure
 *    路由使用的 server-held disclosure 应用 port。
 * 4. createDataPortabilityModule({ exportDependencies, importStore }) —— 装配与
 *    传输无关的数据导出导入实例。
 * 5. createDataPortabilityApiModule({ instance, serverHeldDataDisclosureApi })
 *    —— 把实例与 disclosure port 绑定到 IApiModule handle（只负责 transport 与生命周期）。
 *
 * The returned handle is already fully bound: ApiBootstrapper.register() must
 * be called with it once, and its destroy() disposes the owned instance.
 *
 * 返回的 handle 已完全绑定：ApiBootstrapper.register() 必须恰好注册一次，
 * 其 destroy() 会 dispose 所属实例。
 *
 * @param dependencies - ComposeDataPortabilityDependencies with the runtime Prisma client.
 * @returns ComposedDataPortability — the bound module handle plus the disclosure port.
 */
export function composeDataPortability(
  dependencies: ComposeDataPortabilityDependencies,
): ComposedDataPortability {
  const exportDependencies = createPrismaDataPortabilityDependencies(dependencies.db);
  const importStore = createPrismaDataPortabilityImportStore(dependencies.db);
  const serverHeldDataDisclosureApi = createPrismaServerHeldDataDisclosureApplicationPort(
    dependencies.db,
  );

  const instance = createDataPortabilityModule({
    exportDependencies,
    importStore,
    portableCapabilities: dependencies.portableCapabilities,
  });

  return {
    module: createDataPortabilityApiModule({
      instance,
      serverHeldDataDisclosureApi,
    }),
    serverHeldDataDisclosureApi,
  };
}
