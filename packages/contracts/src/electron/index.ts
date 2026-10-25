/**
 * 兼容 shim（P1 S3，Issue #633）：electron 桌面契约真身已迁至
 * @memoflow/desktop-contracts，本文件仅作单向 re-export，新代码禁止再引用
 * `@memoflow/contracts/electron`。
 * 淘汰条件：全仓该 specifier 引用计数为 0，且 contracts 与 main CI 各绿一轮，
 * 并在 Issue #633 记录摘除证据后，删除本 shim 并摘除 exports 子路径。
 *
 * 冻结例外（真身仍在本目录，由本桶原样转出）：
 * - authenticated-ipc：运行时中间件，归 P1 S4 的 @memoflow/host-runtime；
 * - profile-import：与 data-portability 所有权双向纠缠，待其契约阶段理顺。
 */
export * from '@memoflow/desktop-contracts';
export {
  createAuthenticatedIpcWrapper,
  createAuthenticatedIdentityIpcWrapper,
  withAuthenticatedValue,
  withAuthenticatedIdentity,
  type AuthenticatedIpcWrapperOptions,
  type AuthenticatedIdentityIpcWrapperOptions,
} from './authenticated-ipc';
export * from './profile-import';
