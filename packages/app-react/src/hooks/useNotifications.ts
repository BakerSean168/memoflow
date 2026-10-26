import { useEffect, useState } from 'react';

import type { NotificationClientDTO } from '@memoflow/notification-contracts';
import { presentErrorMessage } from '@memoflow/http-client';

import { useAppSession } from './useAppSession';
import { useNotificationService } from './useNotificationService';

export function useNotifications() {
  const service = useNotificationService();
  const { isRemoteAuthenticated } = useAppSession();
  const [notifications, setNotifications] = useState<NotificationClientDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(isRemoteAuthenticated);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!isRemoteAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const [listResult, unreadResult] = await Promise.all([
      service.findNotifications({ limit: 20, page: 1 }),
      service.getUnreadCount(),
    ]);

    if (!listResult.ok) {
      setNotifications([]);
      setUnreadCount(0);
      setError(presentErrorMessage(listResult.error));
      setIsLoading(false);
      return;
    }

    if (!unreadResult.ok) {
      setNotifications(listResult.data.notifications);
      setUnreadCount(0);
      setError(presentErrorMessage(unreadResult.error));
      setIsLoading(false);
      return;
    }

    setNotifications(listResult.data.notifications);
    setUnreadCount(unreadResult.data.count);
    setIsLoading(false);
  }

  useEffect(() => {
    void load();
  }, [isRemoteAuthenticated]);

  async function refresh() {
    await load();
  }

  async function markAsRead(id: string) {
    const result = await service.markAsRead(id);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return false;
    }

    await load();
    return true;
  }

  async function markAllAsRead() {
    const result = await service.markAllAsRead();
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return false;
    }

    await load();
    return true;
  }

  return {
    error,
    isLoading,
    isRemoteAuthenticated,
    markAllAsRead,
    markAsRead,
    notifications,
    refresh,
    unreadCount,
  };
}
