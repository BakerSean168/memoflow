/**
 * Notification Store - Pinia 状态管理（UI state only）
 *
 * RefArch Phase 5（Query Cache authority pilot）后，Notification 的 server state
 * （list/count/loading/error/total）由 TanStack Vue Query 承载；本 store 只保留
 * page/pageSize 与 read filter 等 UI state 及其持久化。
 */

import { defineStore } from 'pinia';

/** Notification UI read filter（全部/未读）。 */
export type NotificationReadFilter = 'all' | 'unread';

export interface NotificationState {
  pagination: { page: number; pageSize: number };
  readFilter: NotificationReadFilter;
}

export const useNotificationStore = defineStore('notification', {
  state: (): NotificationState => ({
    pagination: { page: 1, pageSize: 20 },
    readFilter: 'all',
  }),

  actions: {
    setPage(p: number) {
      this.pagination.page = p;
    },
    setPageSize(size: number) {
      this.pagination.pageSize = size;
    },
    setReadFilter(filter: NotificationReadFilter) {
      this.readFilter = filter;
    },
    reset() {
      this.$reset();
    },
  },

  persist: {
    pick: ['pagination', 'readFilter'] as string[],
  },
});

export type NotificationStoreType = ReturnType<typeof useNotificationStore>;
