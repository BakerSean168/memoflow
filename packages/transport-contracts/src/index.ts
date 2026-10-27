/**
 * @memoflow/transport-contracts
 * 传输层契约 — Result 信封、PublicFailure 失败契约、HTTP/IPC 纯转换与执行上下文。
 *
 * P1 S2（Issue #633）自 @memoflow/transport-contracts 提取：result 子路径与
 * shared 的 execution-context/context 真身迁至本包，本包为唯一权威定义。
 * 纯函数与类型构成契约语义；实际通信执行不在本包（见 http-client / ipc-client）。
 */
export * from './result';
export type { Context } from './context';
export type { ExecutionContext, ExecutionSource, RequestContext } from './execution-context';

export type { ClientInfo } from './client-info';
