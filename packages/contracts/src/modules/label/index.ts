/**
 * 兼容 shim（P2，Issue #634）：Label 核心契约真身已迁至 @memoflow/label-contracts，
 * 本文件仅作单向 re-export，新代码禁止再引用 `@memoflow/contracts/label`。
 * portable 组合（./portable-v3）暂留守本包，随 data-portability 契约阶段结算。
 * 淘汰条件：全仓 `@memoflow/contracts/label` 引用计数为 0，且 contracts 与 main CI
 * 各绿一轮，并在 Issue #634 记录摘除证据后，删除本 shim 并摘除 exports 子路径。
 */
export * from '@memoflow/label-contracts';
export * from './portable-v3';
