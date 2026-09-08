/**
 * Goal API Module
 * 目标模块 API 入口
 *
 * Transport-only API 模块入口 — 通过 register() 暴露给 ApiBootstrapper：
 * - 只做传输接线（routes + lifecycle），不做 Composition Root 组装
 * - 组装由 apps/api runtime composer 完成，工厂只接收已装配的 instance
 * - 通过 context.middleware 使用平台级中间件（auth, rbac）
 * - 通过 context.router 挂载路由
 *
 * 路由前缀：
 * - /goals        (目标 CRUD + 状态 + 关键结果 + 复盘 + 记录)
 */

export { createGoalApiModule } from './module';
export type { GoalApiModuleContext, GoalApiModuleDef, GoalApiModuleOptions } from './module';
