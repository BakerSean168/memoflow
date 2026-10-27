/**
 * Route Registrar
 *
 * 统一的路由注册器，同时完成 Express 路由绑定和 OpenAPI 文档注册。
 * 消除"双重记账"问题 —— 路由路径、方法、参数只需要写在一个地方。
 *
 * @module @memoflow/utils/result/route-registrar
 *
 * @example
 * ```ts
 * import { RouteRegistrar, successResponse, errorResponse } from '@memoflow/utils/result';
 *
 * const registrar = new RouteRegistrar(router, openApiRegistry, {
 *   basePath: '/api/v1/goals',
 *   defaultTags: ['Goal'],
 *   defaultSecurity: [{ bearerAuth: [] }],
 * });
 *
 * registrar.route(
 *   {
 *     method: 'post',
 *     path: '/',
 *     summary: '创建目标',
 *     request: { body: { content: { 'application/json': { schema: CreateGoalSchema } } } },
 *     responses: { 201: successResponse(GoalResponseSchema, '创建成功') },
 *   },
 *   [auth],
 *   (req, ctx) => controller.create(req.body, ctx),
 *   { successStatus: 201 },
 * );
 * ```
 *
 * Validation-aware variant — the OpenAPI request and the runtime validator
 * share the SAME schema object:
 *
 * ```ts
 * registrar.routeWithValidation(
 *   {
 *     method: 'post',
 *     path: '/',
 *     summary: '创建目标',
 *     request: { body: { content: { 'application/json': { schema: CreateGoalSchema } } } },
 *     responses: { 201: successResponse(GoalResponseSchema, '创建成功') },
 *     validation: { schema: CreateGoalSchema },
 *   },
 *   [auth],
 *   (data, ctx) => controller.create(data, ctx),
 *   { successStatus: 201 },
 * );
 * ```
 */

import type { Result } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import {
  expressAdapter,
  expressAdapterWithValidation,
  type ExpressAdapterOptions,
  type ExpressAdapterValidationOptions,
  type ExpressLikeRequest,
} from './express-adapter';

/** Zod-like schema interface (avoid hard Zod dependency) */
interface ZodLikeSchema<TInput> {
  safeParse(
    data: unknown,
  ):
    | { success: true; data: TInput }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
}

/**
 * Runtime validation binding for a route. The schema must be the SAME object
 * referenced by the OpenAPI request body/query/params registration so the
 * runtime validator and the generated documentation can never drift.
 * 路由的 runtime 验证绑定。schema 必须与 OpenAPI request body/query/params
 * 注册引用同一个对象，保证 runtime 校验与生成文档永不漂移。
 */
export interface ApiRouteValidationBinding<TInput = unknown> {
  /** Contract request schema — single source of truth for runtime + OpenAPI. */
  schema: ZodLikeSchema<TInput>;
  /**
   * Optional input projector composing `{ params, query, body }` into the
   * contract request shape. When omitted, `req.body` is validated (shorthand).
   * 可选输入 projector，把 `{ params, query, body }` 组合成 contract 请求形状；
   * 省略时校验 `req.body`（shorthand）。
   */
  projectInput?: (req: ExpressLikeRequest) => unknown;
}

// ============================================================================
// Minimal Interfaces (avoid hard dependencies on Express / zod-to-openapi)
// ============================================================================

/** Minimal Express Router interface */
interface RouterLike {
  get(path: string, ...handlers: unknown[]): unknown;
  post(path: string, ...handlers: unknown[]): unknown;
  put(path: string, ...handlers: unknown[]): unknown;
  patch(path: string, ...handlers: unknown[]): unknown;
  delete(path: string, ...handlers: unknown[]): unknown;
}

/** Minimal OpenAPI Registry interface (compatible with @asteasolutions/zod-to-openapi) */
export interface OpenApiRegistryLike {
  registerPath(route: Record<string, unknown>): void;
  register(name: string, schema: unknown): void;
}

/** Supported HTTP methods */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

// ============================================================================
// Route Definition
// ============================================================================

/**
 * Unified route definition used for both Express routing and OpenAPI documentation.
 */
export interface ApiRouteDefinition {
  /** HTTP method */
  method: HttpMethod;
  /** Express-style path (e.g., '/', '/:id', '/:id/key-results') */
  path: string;
  /** OpenAPI tags (overrides registrar defaults) */
  tags?: string[];
  /** OpenAPI summary */
  summary?: string;
  /** OpenAPI description */
  description?: string;
  /** OpenAPI security (overrides registrar defaults) */
  security?: Record<string, string[]>[];
  /** OpenAPI request definition (params, query, body) */
  request?: Record<string, unknown>;
  /** OpenAPI response definitions */
  responses?: Record<number, unknown>;
  /** Skip OpenAPI registration for this route (e.g., for PATCH alias routes) */
  skipOpenApi?: boolean;
}

// ============================================================================
// Registrar Configuration
// ============================================================================

export interface RouteRegistrarConfig {
  /** Base path for OpenAPI (e.g., '/api/v1/goals') */
  basePath: string;
  /** Default tags applied to all routes */
  defaultTags?: string[];
  /** Default security applied to all routes */
  defaultSecurity?: Record<string, string[]>[];
}

// ============================================================================
// RouteRegistrar
// ============================================================================

/**
 * Unified route registrar that combines Express routing with OpenAPI documentation.
 *
 * Eliminates the "double bookkeeping" problem by registering both Express routes
 * and OpenAPI path definitions in a single `route()` call.
 *
 * When no OpenAPI registry is provided (e.g., in tests or IPC mode),
 * only Express routes are registered — the behavior degrades gracefully.
 */
export class RouteRegistrar {
  constructor(
    private readonly router: RouterLike,
    private readonly registry: OpenApiRegistryLike | null,
    private readonly config: RouteRegistrarConfig,
  ) {}

  /**
   * Register a named schema in the OpenAPI components section.
   */
  registerSchema(name: string, schema: unknown): this {
    this.registry?.register(name, schema);
    return this;
  }

  /**
   * Register an API route — simultaneously binds Express handler and OpenAPI path.
   *
   * @param def - Route definition (method, path, OpenAPI metadata)
   * @param middleware - Express middleware array (e.g., [auth])
   * @param handler - Controller handler function (receives req and context)
   * @param adapterOptions - Options for expressAdapter (e.g., \{ successStatus: 201 \})
   * @returns this (for chaining)
   */
  route<T>(
    def: ApiRouteDefinition,
    middleware: unknown[],
    handler: (req: ExpressLikeRequest, context: ExecutionContext) => Promise<Result<T>>,
    adapterOptions?: ExpressAdapterOptions,
  ): this {
    this.registerOpenApi(def);

    // 2. Bind Express route
    const adapted = expressAdapter(handler, adapterOptions);
    this.router[def.method](def.path, ...middleware, adapted);

    return this;
  }

  /**
   * Register an API route with upfront contract validation.
   *
   * Binds `expressAdapterWithValidation` so the schema is validated before the
   * controller runs; the SAME schema object referenced by the OpenAPI
   * `request` registration is the runtime validator. The handler receives the
   * parsed contract input instead of the raw request.
   *
   * 注册带前置 contract 校验的 API 路由：用 `expressAdapterWithValidation`
   * 绑定，使 schema 在 controller 之前完成校验；OpenAPI `request` 注册引用
   * 的 schema 对象与 runtime 校验器是同一个。handler 接收解析后的 contract
   * 输入，而不是原始 request。
   *
   * @param def - Route definition including the runtime `validation` binding.
   * @param middleware - Express middleware array (e.g., [auth]).
   * @param handler - Controller handler receiving parsed input and context.
   * @param adapterOptions - Validation-aware adapter options.
   * @returns this (for chaining).
   */
  routeWithValidation<TInput, TOutput>(
    def: ApiRouteDefinition & { validation: ApiRouteValidationBinding<TInput> },
    middleware: unknown[],
    handler: (
      data: TInput,
      context: ExecutionContext,
      req: ExpressLikeRequest,
    ) => Promise<Result<TOutput>>,
    adapterOptions?: ExpressAdapterValidationOptions,
  ): this {
    this.registerOpenApi(def);

    // 2. Bind Express route with the validation adapter
    const adapted = expressAdapterWithValidation(def.validation.schema, handler, {
      ...adapterOptions,
      projectInput: def.validation.projectInput,
    });
    this.router[def.method](def.path, ...middleware, adapted);

    return this;
  }

  /**
   * Get the underlying router instance.
   */
  getRouter(): RouterLike {
    return this.router;
  }

  // ─── Private ───

  /**
   * Register the OpenAPI path for a route definition when a registry is
   * provided and the route is not skipped. Shared by `route` and
   * `routeWithValidation` so runtime and documentation cannot drift.
   * 当提供 registry 且路由未跳过时注册该路由的 OpenAPI path。`route` 与
   * `routeWithValidation` 共用，保证 runtime 与文档不漂移。
   */
  private registerOpenApi(def: ApiRouteDefinition): void {
    if (!this.registry || def.skipOpenApi) {
      return;
    }
    const openApiPath = this.toOpenApiPath(def.path);
    const fullPath =
      openApiPath === '/' ? this.config.basePath : `${this.config.basePath}${openApiPath}`;

    this.registry.registerPath({
      method: def.method,
      path: fullPath,
      tags: def.tags ?? this.config.defaultTags,
      summary: def.summary,
      description: def.description,
      security: def.security ?? this.config.defaultSecurity,
      request: def.request,
      responses: def.responses ?? {},
    });
  }

  /**
   * Convert Express path params to OpenAPI path params.
   * e.g., '/:id/key-results/:krId' → '/{id}/key-results/{krId}'
   */
  private toOpenApiPath(expressPath: string): string {
    return expressPath.replace(/:(\w+)/g, '{$1}');
  }
}
