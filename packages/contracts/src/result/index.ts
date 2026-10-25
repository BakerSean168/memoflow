/**
 * 兼容 shim（P1 S2，Issue #633）：result 真身已迁至 @memoflow/transport-contracts，
 * 本文件仅作单向 re-export，新代码禁止再引用 `@memoflow/contracts/result`。
 * 淘汰条件：全仓该 specifier 引用计数为 0，且 contracts 与 main CI 各绿一轮，
 * 并在 Issue #633 记录摘除证据后，删除本 shim 并摘除 exports 子路径。
 */
export * from '@memoflow/transport-contracts/result';
