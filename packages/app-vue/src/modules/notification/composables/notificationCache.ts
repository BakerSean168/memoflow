/**
 * Notification query cache patch helpers (module internal; plan §3.6).
 * Notification query cache 的 patch helper（模块内部，§3.6）。
 *
 * Only mutation lifecycles call `setQueryData`/`removeQueries` through these helpers;
 * realtime event adapters and components never patch the cache directly.
 * 只有 mutation lifecycle 通过这里调用 `setQueryData`/`removeQueries`；实时事件适配器与组件绝不直接 patch cache。
 */

import type { QueryClient, QueryKey } from '@tanstack/vue-query';
import type { NotificationListResponse, UnreadCountResponse } from '@memoflow/notification-client';
import type { NotificationClientDTO } from '@memoflow/notification-contracts';
import { notificationQueryKeys } from '../../../platform/server-state/query-keys';

/**
 * Read one notification from the detail cache, falling back to any cached identity list.
 * 从 detail cache 读取通知；缺失时回退到任意已缓存的 identity list。
 */
export function findNotificationInCache(
  queryClient: QueryClient,
  identityScope: string,
  id: string,
): NotificationClientDTO | undefined {
  const detail = queryClient.getQueryData<NotificationClientDTO>(
    notificationQueryKeys.detail(identityScope, id),
  );
  if (detail) return detail;
  const lists = queryClient.getQueriesData<NotificationListResponse>({
    queryKey: notificationQueryKeys.lists(identityScope),
  });
  for (const [, data] of lists) {
    const found = data?.notifications.find((n) => n.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Patch every cached list entry + the detail for a server-confirmed notification.
 * 用 server-confirmed 的 DTO patch 所有已缓存 list 条目与 detail。
 */
export function patchNotificationFromServer(
  queryClient: QueryClient,
  identityScope: string,
  notification: NotificationClientDTO,
): void {
  const lists = queryClient.getQueriesData<NotificationListResponse>({
    queryKey: notificationQueryKeys.lists(identityScope),
  });
  for (const [queryKey, data] of lists) {
    if (!data) continue;
    queryClient.setQueryData<NotificationListResponse>(queryKey as QueryKey, {
      ...data,
      notifications: data.notifications.map((n) => (n.id === notification.id ? notification : n)),
    });
  }
  queryClient.setQueryData<NotificationClientDTO>(
    notificationQueryKeys.detail(identityScope, notification.id),
    notification,
  );
}

/**
 * Remove a server-confirmed deleted notification from every cached list + detail.
 * 从所有已缓存 list 与 detail 中移除 server-confirmed 删除的通知。
 */
export function removeNotificationFromCache(
  queryClient: QueryClient,
  identityScope: string,
  id: string,
): void {
  const lists = queryClient.getQueriesData<NotificationListResponse>({
    queryKey: notificationQueryKeys.lists(identityScope),
  });
  for (const [queryKey, data] of lists) {
    if (!data) continue;
    queryClient.setQueryData<NotificationListResponse>(queryKey as QueryKey, {
      ...data,
      notifications: data.notifications.filter((n) => n.id !== id),
    });
  }
  queryClient.removeQueries({ queryKey: notificationQueryKeys.detail(identityScope, id) });
}

/**
 * Adjust the cached unread count by a delta, never going below zero.
 * 按 delta 调整已缓存的未读数，永不为负。
 */
export function adjustUnreadCount(
  queryClient: QueryClient,
  identityScope: string,
  delta: number,
): void {
  const unread = queryClient.getQueriesData<UnreadCountResponse>({
    queryKey: notificationQueryKeys.unread(identityScope),
  });
  for (const [queryKey, data] of unread) {
    const current = typeof data?.count === 'number' ? data.count : 0;
    queryClient.setQueryData<UnreadCountResponse>(queryKey as QueryKey, {
      count: Math.max(0, current + delta),
    });
  }
}
