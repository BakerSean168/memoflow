/**
 * useNotificationMutations — Notification server-state mutations (pilot authority).
 *
 * 全部 mutation 只操作 Query Cache（plan §3.4）：
 * - markAsRead / 单条 delete：**不 speculative**；成功后用 server-returned DTO patch 已缓存
 *   list/detail，且仅在 cache 能证明原 item unread 时安全调整 count（不低于 0）；
 * - markAllAsRead / batch delete：不 optimistic，成功后在 dispatcher 失效 identity root；
 * - onSettled 一律经 dispatcher invalidate（组件不再手动 refresh）。
 * 网络失败（HTTP/IPC）经 runtime 的 `networkMode: 'always'` + `retry:0` 立即进入 onError。
 */
import { computed } from 'vue';
import { useMutation } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';
import { unwrap } from '@memoflow/contracts/result';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { NOTIFICATION_SERVICE_KEY } from '../../../di/keys';
import { useServerStateIdentityScope, useServerStateRuntime } from '../../../platform/server-state';
import { createComposableHandleError } from '../../../shared/utils/create-composable-handle-error';
import {
  adjustUnreadCount,
  findNotificationInCache,
  patchNotificationFromServer,
  removeNotificationFromCache,
} from './notificationCache';

/**
 * Create the Notification mutation set (mark read / mark all / single delete / batch delete).
 * 创建通知 mutation 集合（已读/全部已读/单删/批量删除）。
 */
export function useNotificationMutations() {
  const service = useStrictInject(NOTIFICATION_SERVICE_KEY, 'NotificationService');
  const runtime = useServerStateRuntime();
  const resolveIdentityScope = useServerStateIdentityScope();
  const { t } = useI18n();

  // 与基线一致：Notification Pinia 不再持有 server error 字段，错误走 i18n 翻译 + console 报告。
  const handleError = createComposableHandleError({
    t,
    setError: () => {},
  });

  const markAsRead = useMutation({
    mutationFn: async (id: string) => unwrap(await service.markAsRead(id)),
    onMutate: () => ({ identityScope: resolveIdentityScope() }),
    onSuccess: (dto, _vars, context) => {
      const identityScope = context!.identityScope;
      const cached = findNotificationInCache(runtime.queryClient, identityScope, dto.id);
      patchNotificationFromServer(runtime.queryClient, identityScope, dto);
      if (dto.isRead && cached && !cached.isRead) {
        adjustUnreadCount(runtime.queryClient, identityScope, -1);
      }
    },
    onSettled: (_data, error, id, context) => {
      if (error) handleError(error, 'notification.error.markReadFailed');
      void runtime.dispatcher.invalidate({
        target: 'notification',
        identityScope: context!.identityScope,
        source: 'mutation',
        entityId: id,
      });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => unwrap(await service.markAllAsRead()),
    onMutate: () => ({ identityScope: resolveIdentityScope() }),
    onSettled: (_data, error, _vars, context) => {
      if (error) handleError(error, 'notification.error.markAllReadFailed');
      void runtime.dispatcher.invalidate({
        target: 'notification',
        identityScope: context!.identityScope,
        source: 'mutation',
      });
    },
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => unwrap(await service.deleteNotification(id)),
    onMutate: () => ({ identityScope: resolveIdentityScope() }),
    onSuccess: (_data, id, context) => {
      const identityScope = context!.identityScope;
      const cached = findNotificationInCache(runtime.queryClient, identityScope, id);
      removeNotificationFromCache(runtime.queryClient, identityScope, id);
      if (cached && !cached.isRead) {
        adjustUnreadCount(runtime.queryClient, identityScope, -1);
      }
    },
    onSettled: (_data, error, id, context) => {
      if (error) handleError(error, 'notification.error.deleteFailed');
      void runtime.dispatcher.invalidate({
        target: 'notification',
        identityScope: context!.identityScope,
        source: 'mutation',
        entityId: id,
      });
    },
  });

  const executeAction = useMutation({
    mutationFn: async (input: { notificationId: string; actionKey: string }) =>
      unwrap(await service.executeAction(input)),
    onMutate: () => ({ identityScope: resolveIdentityScope() }),
    onSettled: (_data, error, input, context) => {
      if (error) handleError(error, 'notification.error.actionFailed');
      void runtime.dispatcher.invalidate({
        target: 'notification',
        identityScope: context!.identityScope,
        source: 'mutation',
        entityId: input.notificationId,
      });
      // Routine owner-commands can change the next durable Elapsed schedule.
      // The server owns that reconciliation; client only refreshes Notification fact state.
    },
  });

  const dismissAll = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return { deleted: 0, failed: [] as string[] };
      return unwrap(await service.batchDeleteNotifications(ids));
    },
    onMutate: () => ({ identityScope: resolveIdentityScope() }),
    onSettled: (_data, error, _vars, context) => {
      if (error) handleError(error, 'notification.error.deleteFailed');
      void runtime.dispatcher.invalidate({
        target: 'notification',
        identityScope: context!.identityScope,
        source: 'mutation',
      });
    },
  });

  return {
    markAsRead,
    markAllAsRead,
    dismiss,
    executeAction,
    dismissAll,
    isMutating: computed(
      () =>
        markAsRead.isPending.value ||
        markAllAsRead.isPending.value ||
        dismiss.isPending.value ||
        executeAction.isPending.value ||
        dismissAll.isPending.value,
    ),
  };
}
