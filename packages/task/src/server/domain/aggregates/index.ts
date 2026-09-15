/**
 * Task Aggregates
 * 任务模块聚合根导出
 * 
 * 【规范说明：聚合根（Aggregate Root）】
 * 聚合根是 DDD 中的核心概念：
 * - 聚合的入口点：外部只能通过聚合根访问聚合内的实体
 * - 事务边界：一次事务只能修改一个聚合根
 * - 不变量守护者：确保聚合内的业务规则始终满足
 * - 领域事件发布者：状态变更时发出领域事件
 * 
 * 【TaskPlan 聚合根】
 * - 任务模板管理：一次性、循环任务的定义
 * - 任务实例生成：管理任务实例的生成逻辑
 * - 用户优先级：保留显式 importance 输入
 * - 有效关联：支持 Goal/KR、标签与 checklist
 * 
 * 【TaskOccurrence 聚合根】
 * - 任务实例管理：具体的任务执行实例
 * - 任务状态跟踪：待办、进行中、已完成、已取消
 * - 执行记录：执行时间、执行时长统计
 */

export { TaskOccurrence } from './task-occurrence';
export type { TaskOccurrenceState } from './task-occurrence';
export { TaskPlan } from './task-plan';
export type { TaskPlanProps, TaskPlanState } from './task-plan.state';
