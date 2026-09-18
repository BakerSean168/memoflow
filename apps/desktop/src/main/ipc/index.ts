/**
 * IPC Handlers Index
 *
 * IPC 处理器分为两类：
 * 
 * 1. 业务模块 IPC 处理器（已迁移到 modules/ 目录）
 *    - Goal, Task, Schedule, Reminder, Notification, AI, Account, Auth, Repository, Setting
 *    - 由 modules/index.ts 统一管理
 * 
 * 2. 系统级 IPC 处理器（在本目录）
 *    - system-handlers.ts: 应用信息、系统性能、桌面功能、同步操作
 *
 * NOTE: 业务模块 handlers have been moved to modules/ (EPIC-010)
 * NOTE: 系统 IPC handlers are in ipc/system-handlers.ts (EPIC-011)
 * 
 * ALL IPC HANDLERS ARE NOW ORGANIZED BY CONCERN
 */

export { registerSystemIpcHandlers } from './system-handlers';
