/**
 * Electron IPC auth wrapper for the notification module.
 * 通知模块的 Electron IPC 鉴权包装器。
 *
 * `withAuthenticatedValue` resolves the canonical Phase 2 `ExecutionContext`
 * from the profile auth context (fail-closed, never an identity-only stub).
 * `withAuthenticatedValidation` composes that context resolution with the real
 * `ipcAdapterWithValidation` so transport shape validation is adapter-owned:
 * auth/context → validation → controller. It is a composition fixture, NOT a
 * parallel validation helper — the actual `safeParse` always runs inside
 * `ipcAdapterWithValidation`.
 *
 * `withAuthenticatedValue` 从 profile auth context 解析 canonical Phase 2
 * `ExecutionContext`（fail-closed，绝不返回 identity-only stub）。
 * `withAuthenticatedValidation` 把该 context 解析与真实
 * `ipcAdapterWithValidation` 组合：auth/context → validation → controller。
 * 它是组合 fixture，而不是平行 validation helper——真正的 `safeParse` 始终在
 * `ipcAdapterWithValidation` 内部执行。
 */

import {
  createAuthenticatedIdentityIpcWrapper,
  createAuthenticatedIpcWrapper,
} from '@memoflow/host-runtime/electron-ipc';
import type { IElectronModuleContext } from '@memoflow/contracts/electron';
import type { Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { ipcAdapterWithValidation } from '@memoflow/utils/result';

export const withAuthenticatedValue = createAuthenticatedIpcWrapper({
  unexpectedErrorCode: 'INTERNAL_ERROR',
  unexpectedErrorMessage: 'Notification IPC failed',
});

export const withAuthenticatedIdentity = createAuthenticatedIdentityIpcWrapper({
  unexpectedErrorCode: 'INTERNAL_ERROR',
  unexpectedErrorMessage: 'Notification IPC failed',
});

/** Minimal structural schema interface (avoid hard Zod dependency in the seam). */
interface ZodLikeSchema<TInput> {
  safeParse(
    data: unknown,
  ):
    | { success: true; data: TInput }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } };
}

/** Event-like object accepted by the IPC adapter (avoid hard Electron dependency). */
interface IpcInvokeEventLike {
  sender?: unknown;
  senderFrame?: unknown;
}

/**
 * Composes authenticated context resolution with the real validation IPC
 * adapter for a single channel. The returned handler validates the projected
 * canonical input BEFORE the controller runs and returns an `IpcResult`.
 * Existing payload channels pass a `projectArgs` projector that composes the
 * wire payload into the contract request shape.
 *
 * 把鉴权 context 解析与真实验证型 IPC adapter 组合成单通道 handler：
 * 返回的 handler 在 controller 执行前校验投影后的 canonical 输入，并返回
 * `IpcResult`。既有 payload channel 通过 `projectArgs` projector 把 wire
 * payload 组合成 contract 请求形状。
 *
 * @param ctx - Electron module context resolving the canonical ExecutionContext.
 * @param schema - Contract request schema (single source of truth).
 * @param controllerFn - Controller invocation receiving parsed data + context.
 * @param projectArgs - Optional projector from wire payload to canonical input.
 * @returns A `(event, args) => Promise<IpcResult<T>>` handler for `ipcMain.handle`.
 */
export function withAuthenticatedValidation<TInput, TOutput>(
  ctx: IElectronModuleContext,
  schema: ZodLikeSchema<TInput>,
  controllerFn: (data: TInput, context: ExecutionContext) => Promise<Result<TOutput>>,
  projectArgs?: (args: unknown) => unknown,
): (
  event: IpcInvokeEventLike,
  args: unknown,
) => Promise<import('@memoflow/contracts/result').IpcResult<TOutput>> {
  return (event, args) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      ipcAdapterWithValidation(schema, (data) => controllerFn(data, requestContext), {
        extractContext: () => requestContext,
        projectArgs,
      })(event, args),
    );
}
