import {
  extractStructuredResultError,
  fail,
  isIpcResultEnvelope,
  ok,
  type IpcResult,
  type Result,
} from '@memoflow/transport-contracts/result';
import type { IElectronModuleContext } from '@memoflow/desktop-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { isElectronAuthResolutionError } from '@memoflow/desktop-contracts';

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

/** Minimal structural schema interface (avoid hard Zod dependency in the seam). */
export interface ZodLikeSchema<TInput> {
  safeParse(
    data: unknown,
  ):
    | { success: true; data: TInput }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
}

/** Event-like object accepted by the IPC adapter (avoid hard Electron dependency). */
export interface IpcInvokeEventLike {
  sender?: unknown;
  senderFrame?: unknown;
}

/**
 * Options accepted by the injected validation IPC adapter.
 *
 * Structural mirror of `@memoflow/utils`' `IpcAdapterValidationOptions`: the
 * adapter is injected by each consuming package instead of imported here,
 * because `@memoflow/utils` already depends on `@memoflow/host-runtime` (a
 * reverse import would create a dependency cycle).
 */
export interface AuthenticatedValidationAdapterOptions {
  extractContext?: (event: IpcInvokeEventLike) => ExecutionContext;
  projectArgs?: (args: unknown) => unknown;
}

/**
 * Structural signature of the real `ipcAdapterWithValidation` from
 * `@memoflow/utils/result`, injected by each consuming package.
 */
export type AuthenticatedValidationAdapter = <TInput, TOutput>(
  schema: ZodLikeSchema<TInput>,
  controllerFn: (data: TInput, context: ExecutionContext) => Promise<Result<TOutput>>,
  options?: AuthenticatedValidationAdapterOptions,
) => (event: IpcInvokeEventLike, args: unknown) => Promise<IpcResult<TOutput>>;

/**
 * Options for `createAuthenticatedValidationHandler`.
 */
export interface AuthenticatedValidationHandlerOptions {
  /** Package-owned `withAuthenticatedValue` (carries the package error messages). */
  withAuthenticatedValue: ReturnType<typeof createAuthenticatedIpcWrapper>;
  /** Real validation IPC adapter (`ipcAdapterWithValidation` from `@memoflow/utils/result`). */
  ipcAdapterWithValidation: AuthenticatedValidationAdapter;
}

/**
 * Composes a package's authenticated context resolution with the real
 * validation IPC adapter for a single channel. The returned handler validates
 * the projected canonical input BEFORE the controller runs and returns an
 * `IpcResult`. Existing channels pass a `projectArgs` projector that composes
 * the raw wire args (positional or object payload) into the contract request
 * shape (e.g. `(args) => ({ params: { id: args[0] }, body: args[1] })`).
 *
 * The composition injects the package's own `withAuthenticatedValue` so each
 * package keeps its verbatim error shapes (unexpectedErrorMessage etc.).
 *
 * 把各包的鉴权 context 解析与真实验证型 IPC adapter 组合成单通道 handler：
 * 返回的 handler 在 controller 执行前校验投影后的 canonical 输入，并返回
 * `IpcResult`。既有通道通过 `projectArgs` projector 把原始 wire args
 * （positional 或 object payload）组合成 contract 请求形状（例如
 * `(args) => ({ params: { id: args[0] }, body: args[1] })`）。
 *
 * 组合时注入各包自己的 `withAuthenticatedValue`，逐字保持各包错误形态
 * （unexpectedErrorMessage 等）。
 */
export function createAuthenticatedValidationHandler(
  options: AuthenticatedValidationHandlerOptions,
) {
  const { withAuthenticatedValue, ipcAdapterWithValidation } = options;

  return function withAuthenticatedValidation<TInput, TOutput>(
    ctx: IElectronModuleContext,
    schema: ZodLikeSchema<TInput>,
    controllerFn: (data: TInput, context: ExecutionContext) => Promise<Result<TOutput>>,
    projectArgs?: (args: unknown) => unknown,
  ): (event: IpcInvokeEventLike, args: unknown) => Promise<IpcResult<TOutput>> {
    return (event, args) =>
      withAuthenticatedValue(ctx, async (requestContext) =>
        ipcAdapterWithValidation(schema, (data) => controllerFn(data, requestContext), {
          extractContext: () => requestContext,
          projectArgs,
        })(event, args),
      );
  };
}
