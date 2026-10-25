/**
 * 桌面 IPC 鉴权中间件（宿主运行时）：从 profile auth context 解析 canonical
 * ExecutionContext 并包装 IPC handler 的工厂。
 *
 * P1 S4（Issue #633）自 @memoflow/contracts 的 electron 子路径提取：该工厂是
 * 运行时中间件实现而非契约，真身迁至本包。contracts/electron 桶不设转出
 * （layer:shared 禁止依赖 layer:infra），消费方一律直接引用本子路径。
 */

export * from './authenticated-ipc';
