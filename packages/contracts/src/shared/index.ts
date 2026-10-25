/**
 * 领域核心类型定义
 * 从各个领域模块中提取的核心接口定义
 * 这些类型作为整个系统的契约，各个domain包根据这些接口来实现具体逻辑
 */

// 重新导出重要性级别类型
export * from './value-objects/importance';
// 重新导出紧急性级别类型
export * from './value-objects/urgency';
// 重新导出优先级级别类型
export * from './value-objects/priority';
// 重新导出共享的类型
export * from './shared';
// 重新导出共享的DTOs

export type { Equatable } from './equatable';
export type {
  AppEventRegistry,
  AppEventRegistryExtensions,
  AppRpcRegistry,
  AppRpcRegistryExtensions,
} from './protocol';
export type { IDomainEvent } from './domain-event.interface';
// P1 S2（Issue #633）：ExecutionContext/RequestContext/Context 真身已迁至
// @memoflow/transport-contracts，本桶仅单向 re-export 兼容，新代码请直接
// 引用 @memoflow/transport-contracts。
export type {
  Context,
  ExecutionContext,
  ExecutionSource,
  RequestContext,
} from '@memoflow/transport-contracts';
export * from './account-active-checker';

export * from './value-objects';

// P1 S4（Issue #633）：ModuleManifest/CommandRegistry 与
// ServerTransportModuleContext/ServerModuleHandle 真身已迁至
// @memoflow/host-runtime。注意本桶不设 re-export shim：contracts 是
// layer:shared，模块边界规则禁止 shared 依赖 layer:infra（host-runtime），
// 任何指向 host-runtime 的导入（含 type-only）都会触发
// @nx/enforce-module-boundaries。因此全部消费方已在本步直接改引
// @memoflow/host-runtime，此处不再转出这批符号。
export * from './keyboard-keymap';
