/**
 * Error Handling Middleware
 *
 * 全局错误处理器，必须在所有路由注册之后挂载。
 *
 * Residual 627: 404 + global error responses use Result/HttpResponse
 * envelope only (createApiResponseBuilder), matching expressAdapter.
 * K8s probes remain dedicated non-Result ops shapes.
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { mapPrismaError } from '@memoflow/utils/errors';
import { createLogger } from '@memoflow/utils/logger';
import {
  errorCodeToHttpStatus,
  extractStructuredResultError,
  publicFailureToHttpStatus,
} from '@memoflow/transport-contracts/result';
import { createApiResponseBuilder } from '../http/response-builder.js';
import type { RequestContextCarrierRequest } from '../http/middlewares/request-context.middleware.js';
import { CorsRejectionError } from './global';

const logger = createLogger('ErrorHandler');

type ErrorLike = {
  code?: unknown;
  message?: unknown;
};

function isCorsRejectionError(err: unknown): err is CorsRejectionError {
  return err instanceof CorsRejectionError;
}

function toErrorLike(err: unknown): ErrorLike | null {
  return typeof err === 'object' && err !== null ? (err as ErrorLike) : null;
}

/**
 * 应用全局错误处理中间件
 *
 * 包含：404 兜底路由 + 统一错误处理器
 */
export function applyErrorHandlers(app: Express): void {
  // 404 Not Found
  app.use((req: Request, res: Response) => {
    const responseBuilder = createApiResponseBuilder(req);
    res.status(404).json(responseBuilder.notFound('Not Found'));
  });

  // Global error handler (must have 4 args for Express to recognize it)
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const errorLike = toErrorLike(err);
    const responseBuilder = createApiResponseBuilder(req);
    const requestContext = (req as Partial<RequestContextCarrierRequest>).requestContext;
    logger.error('Express error handler caught error', err, {
      code: errorLike?.code,
      message: errorLike?.message,
      requestId: requestContext?.requestId,
      traceId: requestContext?.traceId,
    });

    // 0. CORS rejections — expected client-side access control failures
    if (isCorsRejectionError(err)) {
      res.status(403).json(responseBuilder.forbidden(err.message));
      return;
    }

    // 1. Structured result/domain errors — safe to expose code + message
    const structuredError = extractStructuredResultError(err);
    if (structuredError) {
      const status =
        structuredError.statusCode ??
        (structuredError.failure
          ? publicFailureToHttpStatus(structuredError.failure)
          : errorCodeToHttpStatus(structuredError.code));
      res
        .status(status)
        .json(
          responseBuilder.error(
            structuredError.code,
            structuredError.message,
            structuredError.details,
            structuredError.context,
            structuredError.failure,
          ),
        );
      return;
    }

    // 2. Prisma errors — map to safe generic messages
    const prismaMapping = mapPrismaError(err);
    if (prismaMapping) {
      res
        .status(prismaMapping.httpStatus)
        .json(responseBuilder.error(prismaMapping.resultCode, prismaMapping.message));
      return;
    }

    // 3. Everything else — never leak internal details
    res.status(500).json(responseBuilder.internalError('Internal server error'));
  });
}
