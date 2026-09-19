/**
 * @file PowerSync API Module
 * @description Provides authentication and CRUD endpoints for PowerSync sync service.
 *
 * This module is registered directly in the API bootstrapper (not in a domain package)
 * because it's infrastructure-level, not a domain concern.
 *
 * Route handlers are thin shells — business logic lives in:
 * - token-issuer.ts — RS256 JWT signing
 * - crud-executor.ts — CRUD batch processing
 * - snapshot-storage.ts — profile snapshot file I/O
 *
 * RefArch Phase 6: `PowerSyncApiModule` became `composePowerSyncApiModule({ db, config? })`.
 * The database client and config are bound in the factory closure by the host runtime
 * BEFORE registration; `register()` only mounts routes against the transport-only
 * context (no `db`). This removes the last registration-time `context.db` consumer
 * among app-local modules.
 *
 * RefArch 阶段 6：`PowerSyncApiModule` 改为 `composePowerSyncApiModule({ db, config? })`。
 * database client 与 config 由宿主 runtime 在注册前通过工厂闭包绑定；
 * `register()` 只针对仅含 transport 的上下文（无 `db`）挂载路由。
 * 这移除了 app-local 模块中最后一个注册期 `context.db` 消费者。
 */

import { Router } from 'express';
import { ResultCode } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import type {
  IApiModule,
  IApiModuleContext,
  DatabaseClient,
} from '../../shared/contracts/api-module.js';
import { getPowerSyncConfig } from '../../shared/infrastructure/config/env.js';
import type { AuthenticatedRequest } from '../../shared/infrastructure/http/middlewares/auth-middleware.js';
import { createApiResponseBuilder } from '../../shared/infrastructure/http/response-builder.js';
import { readStoredProfileSnapshotManifest } from './snapshot-storage.js';
import { issuePowerSyncToken } from './token-issuer.js';
import { executeCrudBatch } from './crud-executor.js';
import { PowerSyncPreferenceConflictError } from './user-preference-crud-executor.js';

const logger = createLogger('PowerSync');

/** PowerSync runtime configuration resolved at composition time. PowerSync 运行时配置，在组合期解析。 */
export type PowerSyncRuntimeConfig = ReturnType<typeof getPowerSyncConfig>;

/**
 * Options for `composePowerSyncApiModule`.
 * `composePowerSyncApiModule` 的选项。
 */
export interface ComposePowerSyncApiModuleOptions {
  /**
   * Database client bound by the host runtime — never appears in the
   * registration context.
   * 由宿主 runtime 绑定的 database client——绝不进入注册上下文。
   */
  readonly db: DatabaseClient;
  /**
   * Optional PowerSync config override; defaults to the validated env config.
   * 可选的 PowerSync 配置覆盖；默认使用已验证的 env 配置。
   */
  readonly config?: PowerSyncRuntimeConfig;
}

/**
 * Creates the app-local PowerSync module handle with DB/config bound in the
 * factory closure.
 * 创建在工厂闭包中绑定 DB/config 的 app-local PowerSync 模块 handle。
 *
 * `register()` only mounts routes against the transport-only context; the CRUD
 * executor receives the bound `db` from the closure, never from the context.
 *
 * `register()` 只针对仅含 transport 的上下文挂载路由；CRUD executor 从闭包接收
 * 绑定的 `db`，绝不从上下文读取。
 *
 * @param options - Options carrying the bound database and optional config.
 * @returns An `IApiModule` handle bound to the database/config.
 */
export function composePowerSyncApiModule(options: ComposePowerSyncApiModuleOptions): IApiModule {
  const db = options.db;
  const config = options.config ?? getPowerSyncConfig();

  return {
    name: 'PowerSync',

    register(context: IApiModuleContext) {
      const { router, middleware } = context;
      const psRouter = Router();

      // ── GET /powersync/token ──
      psRouter.get('/token', middleware.auth, (req, res) => {
        const authenticatedReq = req as AuthenticatedRequest;
        const responseBuilder = createApiResponseBuilder(authenticatedReq);

        try {
          const identityId = authenticatedReq.user?.identityId;
          if (!identityId) {
            return res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
          }

          const result = issuePowerSyncToken(identityId, config);
          if (!result) {
            return res
              .status(503)
              .json(
                responseBuilder.error(
                  ResultCode.SERVICE_UNAVAILABLE,
                  'PowerSync sync is not configured',
                ),
              );
          }

          return res.json(responseBuilder.success(result));
        } catch (error) {
          logger.error('Failed to issue PowerSync token', {
            error,
            identityId: authenticatedReq.user?.identityId,
          });
          return res
            .status(500)
            .json(responseBuilder.internalError('Failed to issue PowerSync token'));
        }
      });

      // ── GET /powersync/profile-snapshot ──
      psRouter.get('/profile-snapshot', middleware.auth, async (req, res) => {
        const authenticatedReq = req as AuthenticatedRequest;
        const responseBuilder = createApiResponseBuilder(authenticatedReq);

        try {
          const identityId = authenticatedReq.user?.identityId;
          if (!identityId) {
            return res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
          }

          const snapshot = await readStoredProfileSnapshotManifest(config.snapshotDir, identityId);

          if (!snapshot) {
            return res.json(
              responseBuilder.success({
                available: false,
                version: null,
                downloadUrl: null,
                checksumSha256: null,
                generatedAt: null,
              }),
            );
          }

          return res.json(
            responseBuilder.success({
              available: true,
              version: snapshot.manifest.version,
              checksumSha256: snapshot.manifest.checksumSha256,
              generatedAt: snapshot.manifest.generatedAt,
              downloadUrl: `/api/v1/powersync/profile-snapshot/download/${snapshot.snapshotKey}/${encodeURIComponent(snapshot.manifest.version)}`,
            }),
          );
        } catch (error) {
          logger.error('Failed to resolve PowerSync profile snapshot manifest', {
            error,
            identityId: authenticatedReq.user?.identityId,
          });
          return res
            .status(500)
            .json(responseBuilder.internalError('Failed to resolve PowerSync profile snapshot'));
        }
      });

      // ── GET /powersync/profile-snapshot/download/:snapshotKey/:version ──
      psRouter.get(
        '/profile-snapshot/download/:snapshotKey/:version',
        middleware.auth,
        async (req, res) => {
          const authenticatedReq = req as AuthenticatedRequest;
          const responseBuilder = createApiResponseBuilder(authenticatedReq);

          try {
            const identityId = authenticatedReq.user?.identityId;
            if (!identityId) {
              return res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
            }

            const snapshot = await readStoredProfileSnapshotManifest(
              config.snapshotDir,
              identityId,
            );

            if (!snapshot) {
              return res.status(404).json(responseBuilder.notFound('Profile snapshot not found'));
            }

            if (
              req.params.snapshotKey !== snapshot.snapshotKey ||
              decodeURIComponent(req.params.version) !== snapshot.manifest.version
            ) {
              return res.status(404).json(responseBuilder.notFound('Profile snapshot not found'));
            }

            return res.sendFile(snapshot.databasePath, {
              headers: {
                'Content-Type': 'application/vnd.sqlite3',
                'Cache-Control': 'private, max-age=60',
                'X-PowerSync-Snapshot-Version': snapshot.manifest.version,
                'X-PowerSync-Snapshot-Checksum': snapshot.manifest.checksumSha256,
              },
            });
          } catch (error) {
            logger.error('Failed to stream PowerSync profile snapshot', {
              error,
              identityId: authenticatedReq.user?.identityId,
            });
            return res
              .status(500)
              .json(responseBuilder.internalError('Failed to stream PowerSync profile snapshot'));
          }
        },
      );

      // ── PUT /powersync/crud ──
      psRouter.put('/crud', middleware.auth, async (req, res) => {
        const authenticatedReq = req as AuthenticatedRequest;
        const responseBuilder = createApiResponseBuilder(authenticatedReq);

        try {
          const identityId = authenticatedReq.user?.identityId;
          if (!identityId) {
            return res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
          }

          const { transactions } = authenticatedReq.body;

          if (!transactions || !Array.isArray(transactions)) {
            return res
              .status(400)
              .json(responseBuilder.badRequest('Missing or invalid transactions array'));
          }

          const result = await executeCrudBatch(db, identityId, transactions);
          return res.json(responseBuilder.success(result));
        } catch (error) {
          if (error instanceof PowerSyncPreferenceConflictError) {
            logger.warn('PowerSync preference CAS conflict', {
              identityId: authenticatedReq.user?.identityId,
              namespace: error.namespace,
              expectedRevision: error.expectedRevision,
              latestRevision: error.latest.revision,
            });
            return res.status(409).json(responseBuilder.conflict(error.message));
          }
          logger.error('PowerSync CRUD processing failed', {
            error,
            identityId: authenticatedReq.user?.identityId,
          });
          return res
            .status(500)
            .json(responseBuilder.internalError('Failed to process sync operations'));
        }
      });

      // ── GET /powersync/schema ──
      // Residual 629: Result/HttpResponse envelope only (no partial { ok, data } dual-track).
      psRouter.get('/schema', (req, res) => {
        const responseBuilder = createApiResponseBuilder(req);
        return res.status(200).json(
          responseBuilder.success({
            powersync_url: config.url ?? '',
            configured: Boolean(config.privateKey),
          }),
        );
      });

      router.use('/powersync', psRouter);
      logger.info('PowerSync routes registered');
    },
  };
}
