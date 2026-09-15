/**
 * Task Store - Pinia 状态管理（pilot 迁移后）
 *
 * RefArch Phase 5（Task templates Query Cache authority pilot）后，Task templates 的
 * server state（list/graph/detail/count/loading/error）由 TanStack Vue Query 承载；
 * 本 store 保留 instances/currentInstance（非 pilot，维持现状）与明确的 UI pagination
 * state。Graph consumer 不把 query data 写回 `dependencies`。
 */

import { defineStore } from 'pinia';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';

export interface TaskState {
  instances: TaskOccurrenceClientDTO[];
  currentInstance: TaskOccurrenceClientDTO | null;
  isLoading: boolean;
  error: string | null;
  pagination: { page: number; pageSize: number };
  isInitialized: boolean;
}

export const useTaskStore = defineStore('task', {
  state: (): TaskState => ({
    instances: [],
    currentInstance: null,
    isLoading: false,
    error: null,
    pagination: { page: 1, pageSize: 20 },
    isInitialized: false,
  }),

  getters: {
    getInstanceById: (state) => (id: string) => state.instances.find((i) => i.id === id),
  },

  actions: {
    setInstances(i: TaskOccurrenceClientDTO[]) {
      this.instances = i;
    },
    addInstance(i: TaskOccurrenceClientDTO) {
      this.instances.push(i);
    },
    updateInstance(i: TaskOccurrenceClientDTO) {
      const idx = this.instances.findIndex((x) => x.id === i.id);
      if (idx !== -1) this.instances[idx] = i;
      if (this.currentInstance?.id === i.id) this.currentInstance = i;
    },
    removeInstance(id: string) {
      this.instances = this.instances.filter((i) => i.id !== id);
    },
    setCurrentInstance(i: TaskOccurrenceClientDTO | null) {
      this.currentInstance = i;
    },
    setLoading(v: boolean) {
      this.isLoading = v;
    },
    setError(e: string | null) {
      this.error = e;
    },
    setPage(p: number) {
      this.pagination.page = p;
    },
    setInitialized(v: boolean) {
      this.isInitialized = v;
    },

    reset() {
      this.$reset();
    },
  },

  persist: {
    pick: ['pagination'] as string[],
  },
});

export type TaskStoreType = ReturnType<typeof useTaskStore>;
