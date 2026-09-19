/**
 * Notification Module - Domain Client
 * 通知模块 - 领域客户端
 *
 * 【模块职责】
 * 管理通知（Notification）的客户端领域模型
 *
 * 【包含内容】
 * - 聚合根（Aggregates）：Notification, NotificationPreference
 * - 实体（Entities）：当前无独立 delivery-channel entity；channel 仅作为投递维度值对象
 * - 值对象（Value Objects）：从 server/domain/value-objects 导入
 *
 * 【依赖规则】
 * ✅ 允许依赖：
 * - @memoflow/utils（基类：AggregateRoot, Entity）
 * - @memoflow/contracts（DTO 接口、Client 接口）
 * - @memoflow/contracts（值对象 DTO、枚举）
 */

// ===== Aggregates =====
export * from './aggregates/index.js';

// ===== Entities =====
export * from './entities/index.js';

// ===== Value Objects =====
export * from '../server/domain/value-objects';
