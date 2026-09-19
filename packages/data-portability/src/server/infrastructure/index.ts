/**
 * Data Portability Infrastructure Server Layer.
 * 数据可移植性基础设施服务端层。
 *
 * Public seam: the V3 module factory and the disclosure-only Prisma adapter.
 * Concrete disclosure source classes stay in their adapter files.
 *
 * 公共 seam：仅导出 V3 模块工厂与 disclosure-only Prisma adapter。
 * 具体 disclosure source 类保留在各自 adapter 文件中。
 */

export {
  createDataPortabilityModule,
  type DataPortabilityModuleDependencies,
  type DataPortabilityModuleInstance,
  type DataPortabilityModuleRuntimeContribution,
  type DataPortabilityModuleUseCases,
} from './data-portability.module';
export type { DataPortabilityApplicationPort } from '../application';
export { createPrismaServerHeldDataDisclosureApplicationPort } from './server-held-data-disclosure';
