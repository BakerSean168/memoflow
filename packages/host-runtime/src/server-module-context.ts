/**
 * Server module handle contract — host-neutral module registration (RefArch Phase 6).
 * Server 模块 handle 契约——宿主中立模块注册（RefArch 阶段 6）。
 *
 * `ServerTransportModuleContext` is the canonical, transport-only registration
 * context: app/router/middleware/OpenAPI. It deliberately carries no `db` —
 * feature modules must receive their database/adapters/application instance
 * through their options (bound by the host runtime composer/factory BEFORE
 * `register()`), so registration can never become a second composition root.
 *
 * `ServerTransportModuleContext` 是规范的、仅含 transport 的注册上下文：
 * app/router/middleware/OpenAPI。它刻意不携带 `db`——feature 模块必须通过
 * options 接收 database/adapters/application instance（由宿主 runtime
 * composer/factory 在 `register()` 之前绑定），因此注册绝不可能是第二个组合根。
 */

/**
 * Canonical transport-only registration context shared by every server module.
 * 所有 server 模块共享的规范 transport-only 注册上下文。
 *
 * Consumers only register routes/handlers and start/dispose their already-bound
 * instance. Persistence and feature assembly live in the host composer, never
 * here.
 *
 * 消费者只注册路由/handler 并 start/dispose 已绑定的实例。持久化与 feature
 * 装配位于宿主 composer，绝不在此。
 */
export interface ServerTransportModuleContext {
  readonly app: import('express').Express;
  readonly router: import('express').Router;
  readonly middleware: {
    readonly auth: import('express').RequestHandler;
    requireRole(roles: string[]): import('express').RequestHandler;
    readonly requireEmailVerified?: import('express').RequestHandler;
  };
  readonly openApiRegistry?: {
    registerPath(route: Record<string, unknown>): void;
    register(name: string, schema: unknown): void;
  };
}

/**
 * Generic server module handle: transport registration + lifecycle only.
 * 通用 server 模块 handle：仅传输注册 + 生命周期。
 *
 * The handle is created by a host factory/composer that binds the assembled
 * instance via options; `register()` must not construct repositories, use
 * cases, adapters or application instances.
 *
 * handle 由宿主 factory/composer 创建，通过 options 绑定已装配实例；
 * `register()` 不得构造 repository、use case、adapter 或 application 实例。
 *
 * @typeParam TContext - The module's registration context; every feature
 *   context extends `ServerTransportModuleContext`.
 */
export interface ServerModuleHandle<
  TContext extends ServerTransportModuleContext = ServerTransportModuleContext,
> {
  /** Module name used for logs and debugging. 模块名称，用于日志和调试。 */
  readonly name: string;
  /**
   * Registers the module against the transport context. Only route/handler
   * binding and lifecycle start are allowed; one registration per handle.
   * 用 transport context 注册模块。只允许路由/handler 绑定与生命周期 start；
   * 每个 handle 只注册一次。
   *
   * @param context - Transport-only registration context (never carries `db`).
   */
  register(context: TContext): Promise<void> | void;
  /**
   * Disposes/stop the same bound instance. Must be idempotent.
   * 释放/停止同一绑定实例。必须幂等。
   */
  destroy?(): Promise<void> | void;
}
