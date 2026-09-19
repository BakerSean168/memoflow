/**
 * Repository API Module
 * 仓库 API 模块
 *
 * Exposes the instance-bound repository API transport factory for apps/api.
 * The host composer assembles the Prisma adapters and host ports and passes
 * the instance in via `RepositoryApiModuleOptions`.
 *
 * 为 apps/api 暴露实例绑定的仓库 API 传输工厂。宿主 composer 组装 Prisma
 * 适配器与宿主 ports，并通过 `RepositoryApiModuleOptions` 传入实例。
 *
 * Route prefix: /repositories — GitHub knowledge repository connections,
 * projections, attachments, confirmed create, and explicit metadata adoption only. Legacy database Repository/Folder/
 * Resource CRUD route builders have been removed.
 * 路由前缀：/repositories — 仅保留 GitHub knowledge repository connections、
 * projections、attachments、confirmed create 与显式 metadata adoption。遗留的数据库
 * Repository/Folder/Resource CRUD 路由构建器已移除。
 */

export { createRepositoryApiModule } from './module';
export type {
  RepositoryApiModuleContext,
  RepositoryApiModuleDef,
  RepositoryApiModuleOptions,
} from './module';
