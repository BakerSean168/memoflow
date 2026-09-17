/**
 * Notification Aggregates
 * 通知模块聚合根导出
 * 
 * 【规范说明：聚合根（Aggregate Root）】
 * 聚合根是 DDD 中的核心概念：
 * - 聚合的入口点：外部只能通过聚合根访问聚合内的实体
 * - 事务边界：一次事务只能修改一个聚合根
 * - 不变量守护者：确保聚合内的业务规则始终满足
 * - 领域事件发布者：状态变更时发出领域事件
 * 
 * 【Notification 聚合根】
 * - 通知管理：通知创建、发送、方式方法管理
 * - 轨迹控制：通知发送状态、轨迹信息
 * 
 * 【NotificationPreference 聚合根】
 * - 用户的通知偏好管理：不同通知类種的接收偏好
 * - 性质控制：不需要特定类制的通知、灚时接收等
 * 
 * 【 * - 通知模板管理：可重用的通知内容配置
 * - 模板変量：模板参数化，支持输入变量控制
 */

export { Notification } from './notification';
export type { NotificationState } from './notification';
export { NotificationPreference } from './notification-preference';
export type { NotificationPreferenceState } from './notification-preference';
