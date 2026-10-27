/**
 * useNotificationUnreadQuery — shared, identity-scoped unread-count query.
 *
 * 未读数是一个 server fact，只应存在一份 Query Cache 数据；页面、胶囊与 Shell 都订阅
 * 同一个 `unread` key，相同 key 的并发 consumer 共享一次 request（§2.2 gate）。
 */
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';
import { translateResultErrorMessage } from '@memoflow/http-client';
import { notificationUiHost } from '../notification-ui-host';

/**
 * Create the shared, identity-scoped Notification unread-count query.
 * 创建共享的 identity-scoped 通知未读数查询。
 */
export function useNotificationUnreadQuery() {
  const service = notificationUiHost.useStrictInject(
    notificationUiHost.NOTIFICATION_SERVICE_KEY,
    'NotificationService',
  );
  const resolveIdentityScope = notificationUiHost.useServerStateIdentityScope();
  const { t } = useI18n();

  const query = useQuery(() => ({
    queryKey: notificationUiHost.notificationQueryKeys.unread(resolveIdentityScope()),
    queryFn: () => notificationUiHost.resultQueryFn(() => service.getUnreadCount())(),
    staleTime: notificationUiHost.NOTIFICATION_STALE_TIME_MS,
  }));

  const unreadCount = computed(() => query.data.value?.count ?? 0);
  const hasUnread = computed(() => unreadCount.value > 0);
  const isLoading = computed(() => query.isPending.value);
  const isError = computed(() => query.isError.value);
  const error = computed(() =>
    query.error.value
      ? translateResultErrorMessage(query.error.value, t, {
          fallbackKey: 'notification.error.refreshStatsFailed',
        })
      : null,
  );

  return {
    query,
    unreadCount,
    hasUnread,
    isLoading,
    isError,
    error,
    refetch: query.refetch,
  };
}
