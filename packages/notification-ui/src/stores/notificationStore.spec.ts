import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useNotificationStore } from './notification-store';

describe('useNotificationStore (UI state only after Query Cache authority pilot)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('executes pagination and read-filter actions against real Pinia state', () => {
    const store = useNotificationStore();
    expect(store.pagination).toEqual({ page: 1, pageSize: 20 });
    expect(store.readFilter).toBe('all');

    store.setPage(4);
    expect(store.pagination.page).toBe(4);
    store.setPageSize(50);
    expect(store.pagination.pageSize).toBe(50);
    store.setReadFilter('unread');
    expect(store.readFilter).toBe('unread');

    store.reset();
    expect(store.pagination).toEqual({ page: 1, pageSize: 20 });
    expect(store.readFilter).toBe('all');
  });

  it('holds no Notification server authority fields', () => {
    const store = useNotificationStore();
    expect(store).not.toHaveProperty('notifications');
    expect(store).not.toHaveProperty('unreadCount');
    expect(store).not.toHaveProperty('isLoading');
    expect(store).not.toHaveProperty('error');
    expect(store).not.toHaveProperty('isInitialized');
    expect(store.pagination).not.toHaveProperty('total');
  });
});
