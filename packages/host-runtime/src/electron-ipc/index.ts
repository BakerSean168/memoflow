/**
 * 桌面 IPC 鉴权中间件（宿主运行时）：从 profile auth context 解析 canonical
 * ExecutionContext 并包装 IPC handler 的工厂。
 *
 * P1 S4（Issue #633）自 @memoflow/contracts 的 electron 子路径提取：该工厂是
 * 运行时中间件实现而非契约，真身迁至本包。过渡期
 * `@memoflow/contracts/electron` 桶单向转出以兼容。
 */

export * from "./authenticated-ipc";
