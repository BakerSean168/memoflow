import { computed } from 'vue';
import type { GoalSystemView } from '@memoflow/goal-contracts';
import { useGoalStore } from '../stores/goal-store';
export function useGoalFilters(fetchGoals: () => Promise<void>) {
  const store = useGoalStore();
  const systemView = computed(() => store.systemView);
  const hasActiveFilter = computed(() => store.hasActiveFilter);
  const labelIdsAll = computed(() => store.labelIdsAll);
  const pagination = computed(() => store.pagination);
  function setSystemView(v: GoalSystemView) {
    store.setSystemView(v);
    void fetchGoals();
  }
  function setLabelIdsAll(ids: readonly string[]) {
    store.setLabelIdsAll(ids);
    void fetchGoals();
  }
  function setPage(p: number) {
    store.setPage(p);
    void fetchGoals();
  }
  function clearFilters() {
    store.clearFilters();
    void fetchGoals();
  }
  function search(q: string) {
    store.setSearchQuery(q);
    void fetchGoals();
  }
  return {
    systemView,
    labelIdsAll,
    hasActiveFilter,
    pagination,
    setSystemView,
    setLabelIdsAll,
    setPage,
    clearFilters,
    search,
  };
}
