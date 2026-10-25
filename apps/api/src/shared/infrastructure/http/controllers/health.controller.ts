/**
 * @file health.controller.ts
 * @description 健康检查控制器 - 提供 K8s 兼容的 liveness/readiness 探针
 * @date 2025-12-22
 */

import type { Request, Response } from 'express';
import { prisma } from '@memoflow/database';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('HealthController');

/**
 * 数据库健康检查结果
 */
interface DatabaseHealthCheck {
  status: 'ok' | 'error';
  latencyMs: number;
  message?: string;
}

/**
 * 就绪检查响应
 */
interface ReadinessResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  checks: {
    database: DatabaseHealthCheck;
  };
  timestamp: string;
}

/**
 * 检查数据库连接状态
 */
async function checkDatabase(): Promise<DatabaseHealthCheck> {
  const startTime = Date.now();
  try {
    // 执行简单的查询来验证数据库连接
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - startTime;

    return {
      status: 'ok',
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown database error';

    logger.error('Database health check failed', error as Error);

    return {
      status: 'error',
      latencyMs,
      message,
    };
  }
}

/**
 * 健康检查控制器
 *
 * 提供以下端点：
 * - `/healthz` - 存活检查 (Liveness probe)
 * - `/readyz` - 就绪检查 (Readiness probe)
 * - `/livez` - 存活检查别名 (K8s 1.16+ 兼容)
 */
export const healthController = {
  /**
   * 存活检查 (Liveness Probe)
   *
   * 极简检查，只要进程在运行就返回 ok。
   * 用于 K8s 判断是否需要重启容器。
   * 当设置 RUNTIME_LANE 时附带 lane，供 Playwright / preflight 识别进程身份，避免误复用 Docker API。
   *
   * @route GET /healthz
   * @route GET /livez
   */
  liveness: (_req: Request, res: Response): void => {
    const payload: { status: 'ok'; lane?: string } = { status: 'ok' };
    const lane = process.env.RUNTIME_LANE?.trim();
    if (lane) {
      payload.lane = lane;
    }
    res.status(200).json(payload);
  },

  /**
   * 就绪检查 (Readiness Probe)
   *
   * 检查所有依赖服务的连接状态。
   * 用于 K8s 判断是否可以将流量路由到此 Pod。
   *
   * @route GET /readyz
   */
  readiness: async (_req: Request, res: Response): Promise<void> => {
    try {
      const databaseCheck = await checkDatabase();

      // 判断整体健康状态
      const allHealthy = databaseCheck.status === 'ok';
      const status: ReadinessResponse['status'] = allHealthy ? 'ok' : 'degraded';

      const response: ReadinessResponse = {
        status,
        checks: {
          database: databaseCheck,
        },
        timestamp: new Date().toISOString(),
      };

      // 如果有任何检查失败，返回 503 Service Unavailable
      const httpStatus = allHealthy ? 200 : 503;
      res.status(httpStatus).json(response);
    } catch (error) {
      logger.error('Readiness check failed unexpectedly', error as Error);

      res.status(503).json({
        status: 'unhealthy',
        checks: {
          database: {
            status: 'error',
            latencyMs: 0,
            message: 'Readiness check failed',
          },
        },
        timestamp: new Date().toISOString(),
      });
    }
  },
};

export default healthController;
