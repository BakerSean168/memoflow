/**
 * Task API Module Exports.
 * 任务 API 模块导出。
 *
 * Transport-only API module surface — composition happens in the apps/api
 * runtime composer; this seam only exposes the instance-bound factory.
 * 传输专用 API 模块表面 — 组装发生在 apps/api runtime composer；
 * 本 seam 只暴露绑定实例的工厂。
 *
 * Route prefixes (fixed, set by registerTaskRoutes):
 * 路由前缀（固定，由 registerTaskRoutes 设定）：
 * - /task-plans
 * - /task-occurrences
 * - /tasks
 */

export { createTaskApiModule } from './module';
export type { TaskApiModuleContext, TaskApiModuleDef, TaskApiModuleOptions } from './module';
