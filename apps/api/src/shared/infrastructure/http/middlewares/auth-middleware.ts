import type { CloudSessionCapability } from '@memoflow/cloud-auth/server';
import type { PrismaClient } from '@memoflow/database';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createLogger, type ILogger } from '@memoflow/utils/logger';
import { createApiResponseBuilder } from '../response-builder.js';
import type { RequestContextCarrierRequest } from './request-context.middleware.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    identityId: string;
    sessionId?: string;
    email?: string;
    emailVerified?: boolean;
  };
}

function sendUnauthorized(req: AuthenticatedRequest, res: Response, message: string): Response {
  return res.status(401).json(createApiResponseBuilder(req).unauthorized(message));
}

function sendInternalError(req: AuthenticatedRequest, res: Response, message: string): Response {
  return res.status(500).json(createApiResponseBuilder(req).internalError(message));
}

/**
 * Cloud authentication middleware.
 * Cloud 鉴权中间件。
 *
 * RefArch Phase 2 ordering contract: this middleware runs AFTER the global
 * RequestContext middleware (which produced `req.requestContext`), so 401/500
 * responses share the entry `X-Request-Id`. It still parses the Principal
 * exactly once and only writes `req.user`; the Express adapter composes the
 * full `ExecutionContext` at the seam.
 *
 * RefArch 阶段 2 顺序契约：本中间件在全局 RequestContext middleware 之后运行
 * （后者已生成 `req.requestContext`），因此 401/500 响应共享入口 `X-Request-Id`。
 * 它仍然只解析一次 Principal 并只写 `req.user`；完整 `ExecutionContext` 由
 * Express adapter 在 seam 处合成。
 */
export function createAuthMiddleware(
  cloudAuth: CloudSessionCapability,
  database?: Pick<PrismaClient, 'account'>,
  logger: ILogger = createLogger('AuthMiddleware'),
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    const requestContext = (req as Partial<RequestContextCarrierRequest>).requestContext;
    try {
      const principal = await cloudAuth.resolveNodePrincipal(req.headers);
      if (!principal) {
        return sendUnauthorized(authenticatedReq, res, '云端认证已失效，请重新认证');
      }
      if (database) {
        const account = await database.account.findUnique({
          where: { id: principal.identityId },
          select: { status: true },
        });
        if (!account || account.status !== 'Active') {
          return sendUnauthorized(authenticatedReq, res, '云端账号已关闭或不可用');
        }
      }

      authenticatedReq.user = {
        identityId: principal.identityId,
        sessionId: principal.sessionId,
        email: principal.email,
        emailVerified: principal.emailVerified,
      };
      return next();
    } catch (error) {
      logger.error('Cloud authentication middleware failed', error, {
        requestId: requestContext?.requestId,
        traceId: requestContext?.traceId,
      });
      return sendInternalError(authenticatedReq, res, 'Internal server error');
    }
  };
}

export function createOptionalAuthMiddleware(
  cloudAuth: CloudSessionCapability,
  database?: Pick<PrismaClient, 'account'>,
  logger?: ILogger,
): RequestHandler {
  const required = createAuthMiddleware(cloudAuth, database, logger);
  return (req, res, next) => {
    if (!req.headers.authorization && !req.headers.cookie) return next();
    return required(req, res, next);
  };
}

export function createRequireEmailVerifiedMiddleware(): RequestHandler {
  return (req, res, next) => {
    const authenticatedReq = req as AuthenticatedRequest;
    if (authenticatedReq.user?.emailVerified) return next();
    return res
      .status(403)
      .json(createApiResponseBuilder(authenticatedReq).forbidden('请先验证登录邮箱'));
  };
}
