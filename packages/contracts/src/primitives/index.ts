/**
 * 兼容 shim（P1 S1，Issue #633）：primitives 真身已迁至 @memoflow/shared-primitives，
 * 本文件仅作单向 re-export，新代码禁止再引用 `@memoflow/contracts/primitives`。
 * 淘汰条件：全仓该 specifier 引用计数为 0，且 contracts 与 main CI 各绿一轮，
 * 并在 Issue #633 记录摘除证据后，删除本 shim 并摘除 exports 子路径。
 */
export * from '@memoflow/shared-primitives';
