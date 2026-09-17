/**
 * Notification Repositories
 * 通知模块仓储接口导出
 * 
 * 【规范说明：仓储（Repository）】
 * 仓储是聚合根的持久化变量市场，应遵循以下原则：
 * - 只接口不接实现：其仓储接口帮助 DDD 的 Transactional Boundaries
 * - 单个聚合根一个仓储：一个聚合根不应该有多个仓储
 * - 聚合内的实体不会直接指接仓储：需要通过聚合根访问
 * - 根据聊天斤团决分：一次只修改一个聚合根
 * 
 * 【INotificationRepository】
 * - 通知持久化：创建、查询、标记已读/删除通知
 * 
 * 【I * - 通知模板持久化：管理可重用的通知模板
 * 
 * 【INotificationPreferenceRepository】
 * - 用户通知偏好持久化：管理用户的通知接收配置
 */

export type {
  INotificationRepository,
  NotificationDeliveryUsage,
  NotificationOutboxDispatchPlan,
} from './i-notification-repository';
export type { INotificationPreferenceRepository } from './i-notification-preference-repository';
