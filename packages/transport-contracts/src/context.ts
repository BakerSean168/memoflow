import type { ExecutionContext } from './execution-context';

/**
 * @deprecated Import `ExecutionContext` from './execution-context' directly.
 * 请直接导入 `ExecutionContext`。
 *
 * This file must NOT declare a second `Context`/`ExecutionContext` interface
 * body — `ExecutionContext` in `./execution-context` is the single canonical
 * shape for the whole repository.
 */
export type Context = ExecutionContext;
