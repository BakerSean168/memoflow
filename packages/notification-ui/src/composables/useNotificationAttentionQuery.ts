import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { notificationUiHost } from '../notification-ui-host';
import { nextAttentionRefresh } from './notificationAttentionRefresh';

/** All notification surfaces share this identity-wide owner-derived count. */
export function useNotificationAttentionQuery() {
  const service = notificationUiHost.useStrictInject(
    notificationUiHost.NOTIFICATION_SERVICE_KEY,
    'NotificationService',
  );
  const resolveIdentityScope = notificationUiHost.useServerStateIdentityScope();
  const query = useQuery(() => ({
    queryKey: notificationUiHost.notificationQueryKeys.attention(resolveIdentityScope()),
    queryFn: () => notificationUiHost.resultQueryFn(() => service.getAttentionCount())(),
    staleTime: notificationUiHost.NOTIFICATION_STALE_TIME_MS,
    refetchInterval: (state) => nextAttentionRefresh(state.state.data?.nextAttentionAt),
    refetchIntervalInBackground: true,
  }));
  return {
    query,
    attentionCount: computed(() => query.data.value?.count ?? 0),
    hasAttention: computed(() => (query.data.value?.count ?? 0) > 0),
    refetch: query.refetch,
  };
}
