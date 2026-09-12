/**
 * API Bootstrapper
 *
 * 智能启动器 — 用链式 API 注册所有 IApiModule，
 * 统一管理全局中间件、路由挂载和错误处理的生命周期。
 *
 * @example
 * ```typescript
 * // Host runtime composes feature modules before registration (see
 * // apps/api/src/runtime/compose-governance.ts and compose-account.ts);
 * // register() only wires transport + lifecycle. 宿主 runtime 先完成 feature 装配，register 只注册 transport。
 * const governanceApiModule = composeGovernance({ db });
 * const accountApiModule = composeAccount({ db, cloudAuth });
 *
 * const app = await new ApiBootstrapper(db)
 *   .register(governanceApiModule)
 *   .register(accountApiModule)
 *   .init();
 *
 * app.listen(3000);
 * ```
 *
 * Residual E5b (elegance): example must name real modules registered from
 * `main.ts` (e.g. `composeAccount`). Do not document retired account module aliases.
 */

import express, { type Express, type RequestHandler, Router } from 'express';
import type { CloudSessionCapability } from '@memoflow/cloud-auth/server';
import type { CloudAuthEmailKind, CloudAuthEmailLinkCapture } from '@memoflow/cloud-auth/server';
import type {
  IApiModule,
  IApiModuleContext,
  IApiMiddleware,
  DatabaseClient,
} from './shared/contracts/api-module';
import { applyGlobalMiddleware, applyErrorHandlers } from './shared/infrastructure/middleware';
import {
  createAuthMiddleware,
  createRequireEmailVerifiedMiddleware,
  requireRole,
} from './shared/infrastructure/http/middlewares';
import { setupSwagger } from './shared/infrastructure/config/swagger';
import { createInfrastructureRouter } from './shared/infrastructure/http/routes/infrastructure-routes';
import { registry } from './shared/infrastructure/openapi/registry';
import { createLogger } from '@memoflow/utils/logger';
import { HttpRequestMetricsRecorder } from './shared/infrastructure/observability/http-request-metrics';
import { NOOP_HTTP_REQUEST_TRACE } from './shared/infrastructure/observability/noop-http-request-trace';
import type { HttpRequestTrace } from './shared/infrastructure/observability/http-request-trace';

const logger = createLogger('Bootstrapper');

export interface PublicAuthCapabilities {
  github: boolean;
}

interface ApiCloudAuthRuntime extends CloudSessionCapability {
  readonly expressHandler: RequestHandler;
}

const NO_PUBLIC_AUTH_CAPABILITIES: PublicAuthCapabilities = Object.freeze({ github: false });

export class ApiBootstrapper {
  private readonly app: Express;
  private readonly rootRouter: Router;
  private readonly modules: IApiModule[] = [];
  private readonly db: DatabaseClient;
  private readonly metricsRecorder: HttpRequestMetricsRecorder;
  private readonly trace: HttpRequestTrace;

  constructor(
    db: DatabaseClient,
    private readonly cloudAuth: ApiCloudAuthRuntime,
    private readonly testEmailLinks?: Pick<CloudAuthEmailLinkCapture, 'findLatest'>,
    trace: HttpRequestTrace = NOOP_HTTP_REQUEST_TRACE,
    private readonly authCapabilities: PublicAuthCapabilities = NO_PUBLIC_AUTH_CAPABILITIES,
  ) {
    this.app = express();
    this.rootRouter = Router();
    this.db = db;
    // Per-instance recorder: no global singleton leaks between tests.
    this.metricsRecorder = new HttpRequestMetricsRecorder();
    this.trace = trace;
  }

  /**
   * 链式注册模块
   */
  public register(module: IApiModule): this {
    this.modules.push(module);
    return this;
  }

  /**
   * 初始化并返回 Express 实例
   *
   * 执行顺序：
   * 1. 全局中间件（Helmet, CORS, Compression 等）
   * 2. Swagger 文档
   * 3. 基础设施路由（health, metrics 等）
   * 4. 模块注册（逐个调用 IApiModule.register）
   * 5. 挂载根路由到 /api 和 /api/v1
   * 6. 错误处理中间件
   */
  public async init(): Promise<Express> {
    // 1. 全局中间件
    applyGlobalMiddleware(this.app, this.metricsRecorder, {
      trace: this.trace,
      beforeBodyParsing: (app) => {
        app.get('/api/auth/capabilities', (_req, res) => {
          res.setHeader('Cache-Control', 'no-store');
          res.json({ providers: this.authCapabilities });
        });

        const testEmailLinks = this.testEmailLinks;
        if (testEmailLinks) {
          app.get('/api/auth/test/last-email-link', (req, res) => {
            const email = typeof req.query.email === 'string' ? req.query.email.trim() : '';
            const kind = req.query.kind;
            if (!email || (kind !== 'email-verification' && kind !== 'password-reset')) {
              res.status(400).json({ message: 'email and a valid kind are required' });
              return;
            }
            const captured = testEmailLinks.findLatest(email, kind as CloudAuthEmailKind);
            if (!captured) {
              res.status(404).json({ data: null });
              return;
            }
            res.json({ data: captured });
          });
        }
        app.all('/api/auth/*splat', this.cloudAuth.expressHandler);
      },
    });

    // 2. Swagger
    setupSwagger(this.app);

    // 3. 基础设施路由（health, metrics 等 — 无版本前缀）
    this.app.use('/', createInfrastructureRouter(this.metricsRecorder));

    // 4. 准备模块上下文（含平台中间件 + 邮箱验证门禁）
    const auth = createAuthMiddleware(this.cloudAuth, this.db);
    const requireEmailVerified = createRequireEmailVerifiedMiddleware();
    const platformMiddleware: IApiMiddleware = {
      auth,
      requireRole: (roles: string[]) => requireRole(roles),
      requireEmailVerified,
    };

    const context: IApiModuleContext = {
      app: this.app,
      router: this.rootRouter,
      middleware: platformMiddleware,
      openApiRegistry: registry,
    };

    logger.info('🚀 Starting Module Registration...');

    // 5. 逐个注册模块
    for (const mod of this.modules) {
      try {
        logger.info(`   ├─ 📦 Loading [${mod.name}]...`);
        await mod.register(context);
        logger.info(`   ├─ ✅ [${mod.name}] loaded`);
      } catch (err) {
        logger.error(`   ├─ ❌ [${mod.name}] failed to load`, err);
        throw err;
      }
    }

    logger.info(`   └─ 🎉 ${this.modules.length} module(s) registered`);

    // 6. 挂载根路由
    this.app.use('/api', this.rootRouter);
    this.app.use('/api/v1', this.rootRouter);

    // 7. 错误处理（必须最后）
    applyErrorHandlers(this.app);

    return this.app;
  }

  /**
   * 优雅关闭：调用所有已注册模块的 destroy() 方法
   */
  public async destroy(): Promise<void> {
    logger.info('Destroying modules...');

    for (const mod of this.modules) {
      if (mod.destroy) {
        try {
          await mod.destroy();
          logger.info(`   ├─ 🗑️ [${mod.name}] destroyed`);
        } catch (err) {
          logger.error(`   ├─ ❌ [${mod.name}] destroy failed`, err);
        }
      }
    }

    logger.info('All modules destroyed');
  }
}
