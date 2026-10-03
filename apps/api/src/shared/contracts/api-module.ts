/**
 * API Module Standard Contracts
 *
 * 所有 API 模块（新模块 & 旧模块适配器）必须实现 IApiModule 接口，
 * 由 ApiBootstrapper 统一注册和管理生命周期。
 *
 * @example
 * ```typescript
 * import type { IApiModule } from './api-module';
 * import { createMyModule } from '@memoflow/my-pkg';
 * import { createMyApiModule } from '@memoflow/my-pkg/api';
 *
 * // Host composition root (apps/api/src/runtime/compose-my.ts): the runtime
 * // selects adapters, assembles the transport-neutral instance, and binds it
 * // into an already-bound IApiModule-compatible handle BEFORE registration.
 * export const MyModule: IApiModule = createMyApiModule({
 *   instance: createMyModule({ repository, servicePort }),
 * });
 * ```
 *
 * RefArch Phase 6: `IApiModuleContext` is transport-only — it carries no `db`.
 * The host composer/factory binds database, adapters and application instances
 * through module options before `register()`; registration only wires transport
 * and lifecycle.
 *
 * RefArch 阶段 6：`IApiModuleContext` 仅含 transport——不携带 `db`。宿主
 * composer/factory 在 `register()` 之前通过模块 options 绑定 database、
 * adapters 与 application 实例；注册只负责 transport 与生命周期。
 */

import type { RequestHandler } from 'express';
import type { ServerModuleHandle, ServerTransportModuleContext } from '@memoflow/contracts/shared';
import type { PrismaClient } from '@memoflow/database';

/**
 * Database client type used by the API host's private bootstrap wiring only.
 * 仅用于 API 宿主私有 bootstrap 装配的数据库客户端类型。
 *
 * `ApiBootstrapper` may use a `DatabaseClient` privately (for example to build
 * the auth middleware), but it never appears in the module registration
 * context. Feature modules receive their persistence through host-bound
 * options instead.
 *
 * `ApiBootstrapper` 可以私有使用 `DatabaseClient`（例如构建 auth middleware），
 * 但它绝不进入模块注册上下文。feature 模块通过宿主绑定的 options 接收持久化。
 */
export type DatabaseClient = PrismaClient;

/**
 * API 中间件工厂
 *
 * ApiBootstrapper 提供给模块的中间件接口，
 * 模块无需直接引用 apps/api 的内部实现，
 * 实现真正的"物理隔离"。
 *
 * 说明（RefArch Phase 2）：RequestContext 属于全局 platform middleware，由
 * `applyGlobalMiddleware()` 作为第一个 `app.use` 挂载，模块不得重复挂载；
 * 默认 Express adapter（expressAdapter/expressAdapterWithValidation）会从全局
 * request carrier（`req.requestContext`）读取 requestId/traceId/startedAt。
 */
export interface IApiMiddleware {
  /** Cloud session authentication middleware. */
  readonly auth: RequestHandler;
  /** 角色权限检查中间件 */
  requireRole(roles: string[]): RequestHandler;
  /**
   * Optional gate after cloud authentication for verified-email capabilities.
   */
  readonly requireEmailVerified?: RequestHandler;
}

/**
 * 模块注册上下文
 *
 * ApiBootstrapper 提供给每个模块的"工具箱"，模块在 register() 中
 * 完成路由挂载与生命周期启动。该上下文仅含 transport，不含 `db`：
 * 持久化与 feature 装配由宿主 composer 在注册前通过 options 绑定。
 */
export interface IApiModuleContext extends ServerTransportModuleContext {}

/**
 * API 模块标准接口
 *
 * 所有业务模块必须实现此接口才能被 ApiBootstrapper 加载。它继承共享的
 * `ServerModuleHandle<IApiModuleContext>`：name + register + destroy。
 *
 * 目标方向（target direction）：runtime-first 装配 —— 宿主（apps/api/src/runtime）
 * 在 register() 之前完成 feature 模块的 Composition Root 组装（选择 adapter →
 * repository → application instance），register() 只负责 transport 注册与模块生命周期
 * （start/dispose）。真实业务 owner 的 runtime composer 是该模式的可执行示例。
 */
export interface IApiModule extends ServerModuleHandle<IApiModuleContext> {}
