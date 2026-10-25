/**
 * 兼容 shim（P1 S3，Issue #633）：electron 桌面契约真身已迁至
 * @memoflow/desktop-contracts，本文件仅作单向 re-export，新代码禁止再引用
 * `@memoflow/contracts/electron`。
 * 淘汰条件：全仓该 specifier 引用计数为 0，且 contracts 与 main CI 各绿一轮，
 * 并在 Issue #633 记录摘除证据后，删除本 shim 并摘除 exports 子路径。
 *
 * 冻结例外：
 * - profile-import：真身仍在本目录（与 data-portability 所有权双向纠缠，
 *   待其契约阶段理顺），由本桶原样转出。
 *
 * P1 S4（Issue #633）：authenticated-ipc 运行时中间件真身已迁至
 * @memoflow/host-runtime（./electron-ipc 子路径），本桶改经 host-runtime
 * 单向转出以兼容，新代码请直接引用 @memoflow/host-runtime/electron-ipc。
 */
export * from '@memoflow/desktop-contracts';
export {
  createAuthenticatedIpcWrapper,
  createAuthenticatedIdentityIpcWrapper,
  withAuthenticatedValue,
  withAuthenticatedIdentity,
  type AuthenticatedIpcWrapperOptions,
  type AuthenticatedIdentityIpcWrapperOptions,
} from '@memoflow/host-runtime/electron-ipc';
export * from './profile-import';
