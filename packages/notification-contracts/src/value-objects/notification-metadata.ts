/**
 * NotificationMetadata Value Object
 * 通知元数据值对象
 *
 * Residual 851: NotificationMetadataDTO dual retired — sole NotificationMetadata interface + type alias.
 */

// Residual 851: sole NotificationMetadata body.
export interface NotificationMetadata {
  icon: string | null;
  image: string | null;
  color: string | null;
  sound: string | null;
  badge: number | null;
  data?: unknown;
}

// Residual 851: NotificationMetadataDTO dual retired — DTO is the NotificationMetadata shape.
export type NotificationMetadataDTO = NotificationMetadata;
