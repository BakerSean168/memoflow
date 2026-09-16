/**
 * Notification HTTP Client Mapper
 * 通知 HTTP 客户端 Mapper
 *
 * Named boundary mapper that projects the typed query object into the generic
 * query params record expected by the HTTP client seam. The mapper owns the
 * shape projection so the boundary never leaks the raw cast casts.
 *
 * 命名边界 mapper：把类型化 query 对象投影为 HTTP client seam 期望的通用
 * query params record。mapper 拥有形状投影，使边界不泄漏 the raw cast 强转。
 */

import type { QueryNotificationsRequest } from '../../../application-client/ports/notification-api-client.port';

/**
 * Projects a typed notification query into the HTTP client query params record.
 * 把类型化通知 query 投影为 HTTP client 的 query params record。
 * @param query - Typed query filters (identity never included; added by auth).
 * @returns Generic query params for the HTTP client.
 */
export function toNotificationQueryParams(
  query: QueryNotificationsRequest,
): Record<string, unknown> {
  return {
    page: query.page,
    limit: query.limit,
    type: query.type,
    isRead: query.isRead,
    archiveState: query.archiveState,
    workflowKey: query.workflowKey,
    topic: query.topic,
    category: query.category,
    startDate: query.startDate,
    endDate: query.endDate,
  };
}
