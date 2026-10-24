/**
 * Notification Application Client Layer
 * 通知模块客户端应用层
 *
 * Constructor-injected client service for notification management.
 * 使用构造函数注入的通知管理客户端服务。
 */

// ===== Port Interfaces / 端口接口 =====
export type { INotificationApiClient } from './ports/notification-api-client.port';

// ===== Client Service / 客户端服务 =====
export {
  NotificationClientService,
  createNotificationClientService,
} from './notification-client-service';
export type { NotificationClientPort } from './notification-client-service';
export { createNotificationServiceFromHttpClient } from './notification-http-service-factory';
