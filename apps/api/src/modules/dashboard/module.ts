/**
 * Dashboard API Module.
 *
 * HOME-1804 retired the cross-domain activity ledger. This temporary legacy
 * module is now a read-only transport adapter over the owner-derived Dashboard
 * projection and will be physically removed by HOME-1805.
 */

import { Router } from 'express';
import type { IApiModule, IApiModuleContext } from '../../shared/contracts/api-module.js';
import type { AuthenticatedRequest } from '../../shared/infrastructure/http/middlewares/auth-middleware.js';
import { createApiResponseBuilder } from '../../shared/infrastructure/http/response-builder.js';
import type { DashboardReadPort } from './dashboard-read-port.js';

/**
 * Composition options for the temporary read-only Dashboard compatibility module.
 * 临时只读 Dashboard 兼容模块的组合选项。
 */
export interface ComposeDashboardApiModuleOptions {
  /**
   * Aggregated owner-derived read port bound by the host runtime.
   * 由宿主 runtime 绑定、从 owner truth 聚合得到的只读端口。
   */
  readonly dashboardReadPort: DashboardReadPort;
}

/**
 * Creates the temporary read-only Dashboard compatibility API module.
 * 创建临时只读 Dashboard 兼容 API 模块；HOME-1805 将物理删除该模块。
 *
 * @param options - Composition options carrying the owner-derived read port.
 * @returns An `IApiModule` that only mounts the legacy read route.
 */
export function composeDashboardApiModule(options: ComposeDashboardApiModuleOptions): IApiModule {
  return {
    name: 'Dashboard',

    register(context: IApiModuleContext) {
      const { router, middleware } = context;
      const dashboardRouter = Router();

      dashboardRouter.get('/stats', middleware.auth, async (req, res) => {
        const responseBuilder = createApiResponseBuilder(req);

        try {
          const authReq = req as AuthenticatedRequest;
          const identityId = authReq.user?.identityId;

          if (!identityId) {
            res.status(401).json(responseBuilder.unauthorized('未授权，请登录'));
            return;
          }

          const data = await options.dashboardReadPort.getDashboardData(identityId);
          res.json(responseBuilder.success(data, 'Success'));
        } catch (_err) {
          res.status(500).json(responseBuilder.internalError('Failed to fetch dashboard stats'));
        }
      });

      router.use('/dashboard', dashboardRouter);
    },
  };
}
