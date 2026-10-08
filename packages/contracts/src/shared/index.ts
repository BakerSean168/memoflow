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
export type { Context } from './context';
export type { ExecutionContext, ExecutionSource, RequestContext } from './execution-context';
export type { ServerModuleHandle, ServerTransportModuleContext } from './server-module-context';
export * from './account-active-checker';

export * from './value-objects';
export * from './dtos';

export * from './module-manifest';
export * from './keyboard-keymap';
