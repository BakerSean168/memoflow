/**
 * Task Module - Domain Client
 * 任务模块 - 领域客户端
 *
 * 【模块职责】
 * 管理任务（Task）的客户端领域模型
 *
 * 【包含内容】
 * - 聚合根（Aggregates）：TaskPlan, TaskOccurrence
 * - 值对象（Value Objects）：从 domain-shared 导入
 *
 * 【依赖规则】
 * ✅ 允许依赖：
 * - @memoflow/utils（基类：AggregateRoot, Entity）
 * - @memoflow/contracts（DTO 接口、Client 接口）
 * - @memoflow/domain-shared（值对象、枚举）
 */

// ===== Aggregates =====
export * from './aggregates/index.js';

// ===== Entities =====
export * from './entities/index.js';

// ===== Value Objects (re-export from domain-shared) =====
export * from '../server/domain/value-objects';
