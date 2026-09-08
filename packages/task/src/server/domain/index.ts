/**
 * Task Module - Domain Server
 * 任务模块 - 领域服务端
 * 
 * 【模块职责】
 * 管理用户任务的核心业务逻辑，包括任务创建、调度、重复规则、实例化等
 * 
 * 【包含内容】
 * - 聚合根（Aggregates）：Task - 任务聚合根
 * - 实体（Entities）：TaskOccurrence - 任务实例
 * - 值对象（Value Objects）：TaskRecurrence, TaskDuration, TaskPriority 等
 * - 仓储接口（Repositories）：ITaskRepository, ITaskOccurrenceRepository
 * - 领域事件（Domain Events）：发布 TaskEventMap 键；事件类型以 @memoflow/contracts/task 为真值
 * - 错误类（Errors）：TaskErrors - 任务相关业务异常
 * 
 * 【业务特性】
 * - 任务调度：重复任务的实例化、调度算法
 * - 任务状态：待办、进行中、已完成、已取消
 * - 优先级管理：任务优先级、紧急度判断
 * - 时间管理：截止日期、提醒时间、持续时长
 * 
 * 【依赖规则】
 * ✅ 允许依赖：
 * - @memoflow/utils（基类：AggregateRoot, Entity）
 * - @memoflow/contracts（DTO 接口、事件 Map）
 * - @memoflow/domain（值对象、枚举）
 * 
 * ❌ 禁止依赖：
 * - @memoflow/domain-client（客户端领域模型）
 * - @memoflow/infrastructure-*（基础设施层）
 * - @memoflow/application-*（应用层）
 * - 外部 I/O 库（fs, axios, prisma, ioredis 等）
 */

// 值对象
export * from './value-objects';

// 实体
export * from './entities';

// 聚合根
export * from './aggregates';

// 仓储接口
export * from './repositories';

// 领域服务
export * from './services';

// 错误类
export * from './value-objects/task-errors';
