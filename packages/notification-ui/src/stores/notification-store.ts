import { defineStore } from 'pinia';

export type NotificationFilter = 'attention' | 'all';

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    pagination: { page: 1, pageSize: 20 },
    filter: 'attention' as NotificationFilter,
  }),
  actions: {
    setPage(page: number) {
      this.pagination.page = page;
    },
    setPageSize(size: number) {
      this.pagination.pageSize = size;
      this.pagination.page = 1;
    },
    setFilter(filter: NotificationFilter) {
      this.filter = filter;
      this.pagination.page = 1;
    },
    reset() {
      this.$reset();
    },
  },
  persist: {
    pick: ['pagination.pageSize', 'filter'] as string[],
    afterHydrate: ({ store }) => {
      store.pagination.page = 1;
    },
  },
});
export type NotificationStoreType = ReturnType<typeof useNotificationStore>;
