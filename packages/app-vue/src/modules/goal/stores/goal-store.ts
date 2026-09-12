import { defineStore } from 'pinia';
import type {
  GoalClientDTO,
  GoalSystemView,
  GoalStatus,
  KeyResultClientDTO,
  GoalReviewClientDTO,
  GoalRecordClientDTO,
  GoalMutationReceipt,
} from '@memoflow/contracts/goal';

export interface GoalState {
  goalById: Record<string, GoalClientDTO>;
  goalIds: string[];
  selectedGoalId: string | null;
  keyResultById: Record<string, KeyResultClientDTO>;
  keyResultIdsByGoalId: Record<string, string[]>;
  goalReviews: GoalReviewClientDTO[];
  goalRecords: GoalRecordClientDTO[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  labelIdsAll: string[];
  systemView: GoalSystemView;
  pagination: { page: number; pageSize: number; total: number };
  isInitialized: boolean;
}

function materializeGoal(state: GoalState, id: string): GoalClientDTO | null {
  const goal = state.goalById[id];
  if (!goal) return null;
  const keyResults = (state.keyResultIdsByGoalId[id] ?? []).flatMap((keyResultId) =>
    state.keyResultById[keyResultId] ? [state.keyResultById[keyResultId]] : [],
  );
  return {
    ...goal,
    keyResults,
    reviews: state.goalReviews.filter((review) => String(review.goalId) === id),
  };
}

export const useGoalStore = defineStore('goal', {
  state: (): GoalState => ({
    goalById: {},
    goalIds: [],
    selectedGoalId: null,
    keyResultById: {},
    keyResultIdsByGoalId: {},
    goalReviews: [],
    goalRecords: [],
    isLoading: false,
    error: null,
    searchQuery: '',
    labelIdsAll: [],
    systemView: 'active',
    pagination: { page: 1, pageSize: 20, total: 0 },
    isInitialized: false,
  }),
  getters: {
    goals: (state): GoalClientDTO[] =>
      state.goalIds.flatMap((id) => {
        const goal = materializeGoal(state, id);
        return goal ? [goal] : [];
      }),
    selectedGoal: (state): GoalClientDTO | null =>
      state.selectedGoalId ? materializeGoal(state, state.selectedGoalId) : null,
    keyResults: (state): KeyResultClientDTO[] =>
      state.selectedGoalId
        ? (state.keyResultIdsByGoalId[state.selectedGoalId] ?? []).flatMap((id) =>
            state.keyResultById[id] ? [state.keyResultById[id]] : [],
          )
        : [],
    getGoalById: (state) => (id: string) => state.goalById[id],
    getKeyResultById: (state) => (id: string) => state.keyResultById[id],
    getGoalsByStatus: (state) => (status: GoalStatus) =>
      state.goalIds
        .map((id) => state.goalById[id])
        .filter((goal): goal is GoalClientDTO => !!goal && goal.status === status),
    activeGoalCount: (state): number =>
      state.goalIds
        .map((id) => state.goalById[id])
        .filter(
          (goal) =>
            goal &&
            (goal.status === 'Planned' || goal.status === 'InProgress') &&
            !goal.archivedAt &&
            !goal.deletedAt,
        ).length,
    completedGoalCount: (state): number =>
      state.goalIds
        .map((id) => state.goalById[id])
        .filter((goal) => goal && goal.status === 'Completed' && !goal.deletedAt).length,
    totalPages: (state): number => Math.ceil(state.pagination.total / state.pagination.pageSize),
    hasActiveFilter: (state): boolean =>
      state.searchQuery.length > 0 || state.labelIdsAll.length > 0,
  },
  actions: {
    setGoals(goals: GoalClientDTO[], total?: number) {
      this.goalIds = goals.map((goal) => String(goal.id));
      for (const goal of goals) this.upsertGoal(goal);
      if (total !== undefined) this.pagination.total = total;
    },
    applyGoalMutationReceipt(receipt: GoalMutationReceipt) {
      const goalId = String(receipt.goalId);
      if (receipt.readModel.version !== receipt.goalVersion) return;
      const existing = this.goalById[goalId];
      if (existing && existing.version > receipt.goalVersion) return;
      const wasListed = this.goalIds.includes(goalId);
      this.upsertGoal(receipt.readModel);
      if (!wasListed) {
        this.goalIds = [goalId, ...this.goalIds];
        this.pagination.total++;
      }
      this.setKeyResults(goalId, receipt.readModel.keyResults, receipt.goalVersion);
      this.goalReviews = [
        ...this.goalReviews.filter((review) => String(review.goalId) !== goalId),
        ...receipt.readModel.reviews,
      ];
      if (receipt.recordChanges) {
        const removedIds = new Set(receipt.recordChanges.removedIds.map(String));
        const upsertedIds = new Set(
          receipt.recordChanges.upserted.map((record) => String(record.id)),
        );
        this.goalRecords = [
          ...this.goalRecords.filter(
            (record) => !removedIds.has(String(record.id)) && !upsertedIds.has(String(record.id)),
          ),
          ...receipt.recordChanges.upserted,
        ];
      }
    },
    removeGoal(id: string) {
      delete this.goalById[id];
      this.goalIds = this.goalIds.filter((goalId) => goalId !== id);
      for (const keyResultId of this.keyResultIdsByGoalId[id] ?? [])
        delete this.keyResultById[keyResultId];
      delete this.keyResultIdsByGoalId[id];
      this.pagination.total = Math.max(0, this.pagination.total - 1);
      if (this.selectedGoalId === id) this.selectedGoalId = null;
    },
    upsertGoal(goal: GoalClientDTO) {
      const { keyResults, reviews, ...root } = goal;
      void reviews;
      void keyResults;
      const id = String(goal.id);
      const existing = this.goalById[id];
      if (!existing || existing.version <= goal.version) this.goalById[id] = root as GoalClientDTO;
    },
    selectGoal(id: string | null) {
      this.selectedGoalId = id;
    },
    setKeyResults(goalId: string, krs: KeyResultClientDTO[], goalVersion: number) {
      if (this.goalById[goalId]?.version !== goalVersion) return;
      const previousIds = this.keyResultIdsByGoalId[goalId] ?? [];
      const nextIds = krs.map((kr) => String(kr.id));
      this.keyResultIdsByGoalId[goalId] = nextIds;
      for (const staleId of previousIds)
        if (!nextIds.includes(staleId)) delete this.keyResultById[staleId];
      for (const kr of krs) this.keyResultById[String(kr.id)] = kr;
    },
    setGoalReviews(r: GoalReviewClientDTO[]) {
      this.goalReviews = r;
    },
    setGoalRecords(r: GoalRecordClientDTO[]) {
      this.goalRecords = r;
    },
    setSearchQuery(q: string) {
      this.searchQuery = q;
      this.pagination.page = 1;
    },
    setLabelIdsAll(ids: readonly string[]) {
      this.labelIdsAll = [...new Set(ids.filter(Boolean))];
      this.pagination.page = 1;
    },
    setSystemView(v: GoalSystemView) {
      this.systemView = v;
      this.pagination.page = 1;
    },
    clearFilters() {
      this.searchQuery = '';
      this.labelIdsAll = [];
      this.pagination.page = 1;
    },
    setPage(p: number) {
      this.pagination.page = p;
    },
    setPageSize(s: number) {
      this.pagination.pageSize = s;
      this.pagination.page = 1;
    },
    setLoading(v: boolean) {
      this.isLoading = v;
    },
    setError(e: string | null) {
      this.error = e;
    },
    setInitialized(v: boolean) {
      this.isInitialized = v;
    },
    reset() {
      this.$reset();
    },
  },
  persist: { pick: ['systemView', 'labelIdsAll', 'pagination'] as string[] },
});
export type GoalStoreType = ReturnType<typeof useGoalStore>;
