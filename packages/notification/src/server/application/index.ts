/** Notification Application Module (Server) */

export type {
  NotificationInboxPort,
  NotificationSseDeliveryEvent,
} from './notification-inbox.port';
export type { NotificationOperationsPort } from './notification-operations.port';
export {
  NotificationOwnerCommandRegistry,
  type NotificationOwnerCommandPort,
  type NotificationOwnerCommandRegistration,
  type NotificationOwnerCommandInvocation,
  type NotificationOwnerCommandReceipt,
} from './notification-owner-command.registry';
export * from './use-cases';
export * from './services';
export * from './notification-preference-portability';
export {
  NotificationPortableCapability,
  createNotificationPortableCapability,
} from './notification-portability';
export type {
  NotificationPortableFactV3,
  NotificationPortableInteractionV3,
  NotificationPortablePayloadV3,
} from '@memoflow/contracts/notification';
