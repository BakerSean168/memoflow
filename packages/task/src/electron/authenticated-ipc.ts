/**
 * Electron IPC auth wrapper for the task module.
 * 任务模块的 Electron IPC 鉴权包装器。
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
  createAuthenticatedIpcWrapper,
  createAuthenticatedValidationHandler,
} from '@memoflow/host-runtime/electron-ipc';
import { ipcAdapterWithValidation } from '@memoflow/utils/result';

export const withAuthenticatedValue = createAuthenticatedIpcWrapper({
  unexpectedErrorCode: 'INTERNAL_ERROR',
  unexpectedErrorMessage: 'Internal task IPC error',
});

export const withAuthenticatedValidation = createAuthenticatedValidationHandler({
  withAuthenticatedValue,
  ipcAdapterWithValidation,
});
