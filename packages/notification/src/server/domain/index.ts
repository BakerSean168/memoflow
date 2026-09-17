/**
 * Notification Module - Domain Server
 * 通知模块 - 领域服务端
 * 
 * 【模块职责】
 * 管理通知系统的核心业务逻辑，包括通知创建、发送、偏好设置、模板管理等
 * 
 * 【包含内容】
 * - 聚合根（Aggregates）：Notification, NotificationPreference,  * - 实体（Entities）：NotificationChannel, NotificationHistory
 * - 仓储接口（Repositories）：INotificationRepository, I * - 领域服务（Domain Services）：NotificationDeliveryService, NotificationBatchService
 * 
 * 【业务特性】
 * - 多渠道通知：邮件、短信、推送、站内信
 * - 通知偏好：用户可配置的通知设置
 * - 通知模板：可重用的通知内容模板
 * - 批量通知：高效的批量发送机制
 * - 通知历史：发送记录和状态跟踪
 * 
 * 【依赖规则】
 * ✅ 允许依赖：
 * - @memoflow/utils（基类：AggregateRoot, Entity）
 * - @memoflow/contracts（DTO 接口、事件 Map）
 * - server/domain/value-objects（值对象、枚举）
 * 
 * ❌ 禁止依赖：
 * - @memoflow/domain-client（客户端领域模型）
 * - @memoflow/infrastructure-*（基础设施层）
 * - @memoflow/application-*（应用层）
 * - 外部 I/O 库（fs, axios, prisma, ioredis 等）
 */

// Value Objects
export * from './value-objects';

// Aggregates
export * from './aggregates/notification';
export { NotificationPreference } from './aggregates/notification-preference';
export type { NotificationPreferenceState } from './aggregates/notification-preference';

// Entities
export { NotificationChannel } from './entities/notification-channel';
export type { NotificationChannelState } from './entities/notification-channel';
export { NotificationHistory } from './entities/notification-history';
export type { NotificationHistoryState } from './entities/notification-history';

// Repositories
export type { INotificationRepository } from './repositories/i-notification-repository';
export type { INotificationPreferenceRepository } from './repositories/i-notification-preference-repository';

// Services
export * from './services';

export { NotificationWorkflowCatalog, BUILTIN_NOTIFICATION_WORKFLOWS } from './services/notification-workflow-catalog';
