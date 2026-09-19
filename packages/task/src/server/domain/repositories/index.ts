/**
 * Task Repositories
 * 任务模块仓储接口导出
 *
 * 【规范说明：仓储（Repository）】
 * 仓储是聚合根的持久化抽象，应遵循以下原则：
 * - 只定义接口不实现：由基础设施层实现
 * - 一个聚合根对应一个仓储
 * - 聚合内的实体不直接拥有仓储：需要通过聚合根访问
 */

export type { ITaskOccurrenceRepository } from './i-task-occurrence-repository';
export { TaskLabelOwnershipError } from './i-task-plan-repository';
export type { ITaskPlanRepository, TaskFilters } from './i-task-plan-repository';
