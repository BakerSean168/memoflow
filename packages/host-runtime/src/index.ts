/**
 * Host Runtime
 *
 * 宿主侧运行时工具：模块清单契约与命令注册表（ModuleManifest /
 * CommandRegistry）、宿主中立的 Server 模块注册上下文
 * （ServerTransportModuleContext / ServerModuleHandle）。
 *
 * @module @memoflow/host-runtime
 *
 * P1 S4（Issue #633）自 @memoflow/contracts 的 shared 子路径提取：这两组
 * 内容是宿主组合契约与有状态运行时实现（CommandRegistry），不是纯契约，
 * 真身迁至本包，本包为唯一权威定义。桌面 IPC 鉴权中间件工厂在
 * `./electron-ipc` 子路径。过渡期 `@memoflow/contracts/shared` 桶单向
 * re-export 本包符号以兼容。
 */

export * from "./module-manifest";
export type { ServerModuleHandle, ServerTransportModuleContext } from "./server-module-context";
