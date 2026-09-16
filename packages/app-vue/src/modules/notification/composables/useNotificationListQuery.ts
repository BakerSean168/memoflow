/**
 * useNotificationListQuery — identity-scoped Notification list query (pilot authority).
 *
 * Notification list server state 的唯一 renderer authority 是 TanStack Query Cache；本
 * composable 以 canonical list key 暴露 list query。相同 key 的并发 consumer 共享一次
 * request；不同 list params（如 page 与 capsule 的 limit）各自独立，不再互相覆盖。
 *
 * `page`/`limit` 缺省取自 Notification Pinia（保留 UI pagination state）。
 * Identity scope 由 host 提供的 resolver 解析（web cloud auth / desktop local profile）。
 */
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';
import type { NotificationClientDTO } from '@memoflow/contracts/notification';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { NOTIFICATION_SERVICE_KEY } from '../../../di/keys';
import { useServerStateIdentityScope } from '../../../platform/server-state';
import {
  canonicalizeNotificationListQuery,
  notificationQueryKeys,
} from '../../../platform/server-state/query-keys';
import { NOTIFICATION_STALE_TIME_MS } from '../../../platform/server-state/query-policy';
import { resultQueryFn } from '../../../platform/server-state/result-query';
import { translateResultError } from '../../../shared/utils/translate-result-error';
import { useNotificationStore } from '../stores/notification-store';

/** Options for the Notification list query. 通知列表查询选项。 */
export interface UseNotificationListQueryOptions {
  /** Explicit page override (e.g. capsule preview always page 1). 显式 page（如胶囊预览恒为 1）。 */
  page?: number;
  /** Explicit limit override. 显式 limit。 */
  limit?: number;
  /** Server-side `isRead` filter. 服务端 isRead 过滤。 */
  isRead?: boolean;
  /** Server-side archive filter. */
  archiveState?: 'active' | 'archived' | 'all';
  /** Server-side type filter. 服务端 type 过滤。 */
  type?: string;
  /** Server-side startDate filter. 服务端 startDate 过滤。 */
  startDate?: string;
  /** Server-side endDate filter. 服务端 endDate 过滤。 */
  endDate?: string;
}

/**
 * Create an identity-scoped Notification list query backed by the query cache.
 * 创建基于 query cache 的 identity-scoped 通知列表查询。
 */
export function useNotificationListQuery(options: UseNotificationListQueryOptions = {}) {
  const service = useStrictInject(NOTIFICATION_SERVICE_KEY, 'NotificationService');
  const resolveIdentityScope = useServerStateIdentityScope();
  const store = useNotificationStore();
  const { t } = useI18n();

  const canonical = computed(() =>
    canonicalizeNotificationListQuery({
      page: options.page ?? store.pagination.page,
      limit: options.limit ?? store.pagination.pageSize,
      isRead: options.isRead,
      archiveState: options.archiveState,
      type: options.type,
      startDate: options.startDate,
      endDate: options.endDate,
    }),
  );

  const query = useQuery(() => {
    const identityScope = resolveIdentityScope();
    const params = canonical.value;
    return {
      queryKey: notificationQueryKeys.list(identityScope, params),
      queryFn: () =>
        resultQueryFn(() =>
          service.findNotifications(params as Parameters<typeof service.findNotifications>[0]),
        )(),
      staleTime: NOTIFICATION_STALE_TIME_MS,
    };
  });

  const notifications = computed<NotificationClientDTO[]>(
    () => query.data.value?.notifications ?? [],
  );
  const total = computed(() => query.data.value?.total ?? 0);
  const isLoading = computed(() => query.isPending.value);
  const isError = computed(() => query.isError.value);
  const error = computed(() =>
    query.error.value
      ? translateResultError(query.error.value, t, {
          fallbackKey: 'notification.error.fetchFailed',
        })
      : null,
  );

  return {
    query,
    notifications,
    total,
    isLoading,
    isError,
    error,
    refetch: query.refetch,
  };
}
