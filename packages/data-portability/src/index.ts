/**
 * @memoflow/data-portability
 *
 * Data portability module runtime root.
 *
 * Public contracts are centralized in `@memoflow/contracts/data-portability`.
 * Root exports are limited to the canonical server composition root:
 * ingredient factories, set types, module factory, runtime contribution
 * factories and port types. Client / API / Electron seams use dedicated
 * subpaths.
 *
 * 数据可移植性模块运行时根。
 * 公开契约集中在 `@memoflow/contracts/data-portability`。
 * 根导出仅限于规范化的服务端组合根：原料工厂、集合类型、模块工厂、
 * 运行时贡献工厂与 Port 类型。Client / API / Electron 使用独立 subpath。
 */

export {
  createDataPortabilityModule,
  createPrismaServerHeldDataDisclosureApplicationPort,
  type DataPortabilityModuleDependencies,
  type DataPortabilityModuleInstance,
  type DataPortabilityModuleRuntimeContribution,
} from './server';
export type { DataPortabilityApplicationPort } from './server';
export type { ServerHeldDataDisclosureApplicationPort } from './server';
