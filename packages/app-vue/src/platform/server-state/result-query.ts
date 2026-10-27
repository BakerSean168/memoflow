/**
 * Result → Query function helpers for the server-state pilots.
 * server-state 试点使用的 Result → 查询函数辅助工具。
 *
 * Per plan §3.4: query/mutation functions turn existing `Result.fail` into a typed thrown
 * error so Vue Query enters `error/onError`; the transport Result contract is unchanged and
 * UI feedback keeps flowing through the existing i18n/toast adapters.
 * 按计划 §3.4：query/mutation 函数把 `Result.fail` 转为 typed thrown error，让 Vue Query 进入
 * error/onError；transport Result 契约不变，UI 反馈继续走现有 i18n/toast 适配器。
 */

import {
  unwrap,
  type Result,
  type ResultErrorException,
} from '@memoflow/transport-contracts/result';

/**
 * Convert a `Promise<Result<T>>` into a query/mutation function `() => Promise<T>`.
 * 把 `Promise<Result<T>>` 转为 query/mutation 函数 `() => Promise<T>`。
 *
 * On failure the original Result error is rethrown as a `ResultErrorException`
 * (code/message/details/context preserved).
 * 失败时把原 Result error 以 `ResultErrorException` 抛出（保留 code/message/details/context）。
 */
export function resultQueryFn<T>(fn: () => Promise<Result<T>>): () => Promise<T> {
  return async () => unwrap(await fn());
}

/** Type-only re-export so callers can type query errors without importing contracts. */
export type { ResultErrorException };
