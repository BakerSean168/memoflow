import {
  extractStructuredResultError,
  fail,
  isIpcResultEnvelope,
  ok,
  type IpcResult,
} from '@memoflow/transport-contracts/result';
import type { IElectronModuleContext } from './index';
import type { ExecutionContext } from '../shared';
import { isElectronAuthResolutionError } from './auth-context';

type UnexpectedErrorCode = 'INTERNAL_ERROR';

export interface AuthenticatedIpcWrapperOptions {
  authRequiredMessage?: string;
  authRestoringMessage?: string;
  unexpectedErrorCode?: UnexpectedErrorCode;
  unexpectedErrorMessage?: string;
}

export interface AuthenticatedIdentityIpcWrapperOptions extends AuthenticatedIpcWrapperOptions {}

export function createAuthenticatedIpcWrapper(options: AuthenticatedIpcWrapperOptions = {}) {
  const authRequiredMessage = options.authRequiredMessage ?? 'Authentication required';
  const authRestoringMessage = options.authRestoringMessage ?? 'Authentication restore in progress';
  const unexpectedErrorCode = options.unexpectedErrorCode ?? 'INTERNAL_ERROR';
  const unexpectedErrorMessage = options.unexpectedErrorMessage ?? 'Internal IPC error';

  return async function withAuthenticatedValue<T>(
    ctx: IElectronModuleContext,
    handler: (requestContext: ExecutionContext) => Promise<IpcResult<T> | T>,
  ): Promise<IpcResult<T>> {
    try {
      console.info('[contracts:authenticated-ipc] 开始执行鉴权 IPC 包装', {
        hasAuthResolver: true,
      });
      const requestContext = await ctx.auth.requireRequestContext();
      console.info('[contracts:authenticated-ipc] 已获取请求上下文', {
        identityId: requestContext.identityId,
      });
      const result = await handler(requestContext);
      console.info('[contracts:authenticated-ipc] 处理器执行完成', {
        isIpcResult: isIpcResultEnvelope(result),
        hasOk: typeof result === 'object' && result !== null && 'ok' in result,
      });
      return isIpcResultEnvelope(result) ? result : ok(result);
    } catch (error) {
      console.info('[contracts:authenticated-ipc] 捕获到 IPC 错误', {
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        hasCause: typeof error === 'object' && error !== null && 'cause' in error,
        hasContext: typeof error === 'object' && error !== null && 'context' in error,
        hasDetails: typeof error === 'object' && error !== null && 'details' in error,
      });
      if (isElectronAuthResolutionError(error)) {
        return fail({
          code: error.code,
          message: error.code === 'AUTH_REQUIRED' ? authRequiredMessage : authRestoringMessage,
        });
      }

      const structuredError = extractStructuredResultError(error);
      if (structuredError) {
        console.info('[contracts:authenticated-ipc] 已提取结构化错误', {
          code: structuredError.code,
          message: structuredError.message,
          hasCause: structuredError.cause !== undefined,
          causeType:
            structuredError.cause instanceof Error
              ? `Error:${structuredError.cause.name}`
              : typeof structuredError.cause,
          hasContext: structuredError.context !== undefined,
          hasDetails: structuredError.details !== undefined,
        });
        return fail({
          code: structuredError.code,
          message: structuredError.message,
          details: structuredError.details,
          context: structuredError.context,
        });
      }

      return fail({ code: unexpectedErrorCode, message: unexpectedErrorMessage });
    }
  };
}

export const withAuthenticatedValue = createAuthenticatedIpcWrapper();

export function createAuthenticatedIdentityIpcWrapper(
  options: AuthenticatedIdentityIpcWrapperOptions = {},
) {
  const withAuthenticatedContext = createAuthenticatedIpcWrapper(options);

  return function withAuthenticatedIdentity<T>(
    ctx: IElectronModuleContext,
    handler: (identityId: string) => Promise<IpcResult<T> | T>,
  ): Promise<IpcResult<T>> {
    return withAuthenticatedContext(ctx, (requestContext) => handler(requestContext.identityId));
  };
}

export const withAuthenticatedIdentity = createAuthenticatedIdentityIpcWrapper();
