/**
 * Task Application Module (Server)
 *
 * 提供 Task 模块的所有 Application Services、Use Cases 和 Query Services
 *
 * 类型定义请从 @memoflow/contracts/task 导入
 */

// ===== Use Cases (CQRS Commands and Queries) =====
export * from './use-cases';

// ===== Query Services (Advanced Querying) =====
export * from './services';

// ===== Reliable cross-module delivery =====
export * from './outbox';

export type { TaskApplicationPort } from './task.application.port';

// ===== Cross-module owner read ports =====
export type * from './ports';
