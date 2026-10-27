/**
 * 兼容 shim（P1 S3，Issue #633）：electron 桌面契约真身已迁至
 * @memoflow/desktop-contracts，本文件仅作单向 re-export，新代码禁止再引用
 * `@memoflow/contracts/electron`。
 * 淘汰条件：全仓该 specifier 引用计数为 0，且 contracts 与 main CI 各绿一轮，
 * 并在 Issue #633 记录摘除证据后，删除本 shim 并摘除 exports 子路径。
 *
 * P1 S4（Issue #633）：authenticated-ipc 运行时中间件真身已迁至
 * @memoflow/host-runtime（./electron-ipc 子路径）。本桶不转出这批符号：
 * contracts 是 layer:shared，模块边界规则禁止 shared 依赖 layer:infra，
 * 全部消费方已在本步直接改引 @memoflow/host-runtime/electron-ipc。
 */
export * from '@memoflow/desktop-contracts';
