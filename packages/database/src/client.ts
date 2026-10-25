/**
 * @file Database Client Singleton
 * @description 管理共享的 PrismaClient 实例，防止热重载时连接池泄漏。
 *
 * 所有模块应通过本模块获取数据库连接，而不是自行创建 PrismaClient。
 */

import { PrismaClient } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  // eslint-disable-next-line no-var
  var __memoflow_prisma: PrismaClient | undefined;
}

function resolveDatabaseConnectionString(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DB_HOST;
  if (!host) {
    throw new Error('DATABASE_URL or DB_HOST must be set before initializing PrismaClient');
  }

  const username = encodeURIComponent(process.env.DB_USER || 'memoflow');
  const password = process.env.DB_PASSWORD ? `:${encodeURIComponent(process.env.DB_PASSWORD)}` : '';
  const port = process.env.DB_PORT || '5432';
  const database = encodeURIComponent(process.env.DB_NAME || 'memoflow');
  const connectionString = `postgresql://${username}${password}@${host}:${port}/${database}?schema=public`;

  process.env.DATABASE_URL = connectionString;
  return connectionString;
}

/**
 * 共享 PrismaClient 单例。
 *
 * ✅ Prisma 7 使用 adapter 模式连接数据库
 * 开发环境下挂载到 globalThis 以防热重载创建多个连接。
 */
export const prisma: PrismaClient = (() => {
  if (globalThis.__memoflow_prisma) {
    return globalThis.__memoflow_prisma;
  }

  const connectionString = resolveDatabaseConnectionString();

  // ✅ 直接传 connectionString 给 adapter（Prisma 7 推荐方式）
  const adapter = new PrismaPg({
    connectionString,
  });

  // 创建 PrismaClient
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

  if (process.env.NODE_ENV !== 'production') {
    globalThis.__memoflow_prisma = client;
  }

  return client;
})();

/**
 * 显式连接数据库（Prisma 默认懒连接）。
 */
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

/**
 * 断开数据库连接，用于优雅关闭。
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
