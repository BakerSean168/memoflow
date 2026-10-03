/**
 * @memoflow/database — 共享数据库基础设施
 *
 * 提供统一的 PrismaClient 和所有模块的 Model 类型。
 * 这是数据库运行时连接管理与 Prisma 生成客户端的 Single Source of Truth。
 *
 * @example
 * ```typescript
 * // 获取单例连接
 * import { prisma } from '@memoflow/database';
 *
 * // 使用 PrismaClient 类型（用于 DI）
 * import type { PrismaClient } from '@memoflow/database';
 *
 * // 使用 Model 类型
 * import type { Goal, TaskPlan } from '@memoflow/database';
 * ```
 */

// PrismaClient 类 & 生成的 Model 类型
export * from './generated/prisma/client.js';

// 单例实例 & 生命周期管理
export { prisma, connectDatabase, disconnectDatabase } from './client.js';
