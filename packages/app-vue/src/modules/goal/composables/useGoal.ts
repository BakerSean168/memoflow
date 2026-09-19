/**
 * useGoal - 目标模块主 composable
 *
 * 编排 GoalClientService 调用 + Store 更新 + 错误处理。
 * 通过 inject(GOAL_SERVICE_KEY) 获取服务实例，
 * 使用 Result<T> 模式替代 try/catch。
 *
 * 子实体操作已拆分：
 * - useGoalFilters: filter/search
 * - useKeyResults: key result CRUD
 * - useGoalRecords: records + reviews
 * - goalOperations: 共享 orchestration helpers
 */

import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useGoalStore } from '../stores/goal-store';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { sanitizeForIpc } from '../../../shared/utils/ipc';
import type {
  GoalClientDTO,
  CreateGoalReq,
  UpdateGoalReq,
  GetGoalAggregateRes,
} from '@memoflow/contracts/goal';
import { executeGoalOperation, createGoalErrorHandler } from './goalOperations';
import { useGoalFilters } from './useGoalFilters';
import { useKeyResults } from './useKeyResults';
import { useGoalRecords } from './useGoalRecords';

type GoalEntityLike = { toDTO(): GoalClientDTO };

export function useGoal() {
  const store = useGoalStore();
  const service = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
  const { t } = useI18n();
  const savingId = ref<string | null>(null);

  const goals = computed(() => store.goals);
  const selectedGoal = computed(() => store.selectedGoal);
  const keyResults = computed(() => store.keyResults);
  const goalReviews = computed(() => store.goalReviews);
  const goalRecords = computed(() => store.goalRecords);
  const isLoading = computed(() => store.isLoading);
  const error = computed(() => store.error);
  const isSaving = computed(() => savingId.value !== null);

  const opOpts = {
    t,
    setError: (msg: string | null) => store.setError(msg),
    onError: createGoalErrorHandler(t, (msg) => store.setError(msg)),
  };

  // ── Goal CRUD ────────────────────────────────────────────────────────

  async function fetchGoals() {
    store.setLoading(true);
    store.setError(null);
    try {
      const searchQuery = store.searchQuery || undefined;
      const params = {
        systemView: store.systemView,
        page: store.pagination.page,
        pageSize: store.pagination.pageSize,
        labelIdsAll: store.labelIdsAll.length ? [...store.labelIdsAll] : undefined,
      };

      const result = await service.listGoals({
        ...params,
        query: searchQuery,
      });

      if (result.ok) {
        store.setGoals(
          (result.data.goals ?? []).map((g: GoalEntityLike) => g.toDTO()),
          result.data.pagination?.total ?? 0,
        );
      } else {
        opOpts.onError(result.error, 'goal.error.loadListFailed', 'fetchGoals');
      }
    } catch (e: unknown) {
      opOpts.onError(e, 'goal.error.loadListException', 'fetchGoals');
    } finally {
      store.setLoading(false);
    }
  }

  async function createGoal(req: CreateGoalReq) {
    savingId.value = 'new';
    store.setError(null);
    try {
      const data = await executeGoalOperation(() => service.createGoal(sanitizeForIpc(req)), {
        ...opOpts,
        fallbackKey: 'goal.error.createFailed',
        scope: 'createGoal',
      });
      if (data) {
        store.applyGoalMutationReceipt(data);
        return data.readModel;
      }
      return null;
    } finally {
      savingId.value = null;
    }
  }

  async function updateGoal(id: string, req: UpdateGoalReq) {
    savingId.value = id;
    store.setError(null);
    try {
      const data = await executeGoalOperation(() => service.updateGoal(id, sanitizeForIpc(req)), {
        ...opOpts,
        fallbackKey: 'goal.error.updateFailed',
        scope: 'updateGoal',
      });
      if (data) {
        store.applyGoalMutationReceipt(data);
        return data.readModel;
      }
      return null;
    } finally {
      savingId.value = null;
    }
  }

  async function deleteGoal(id: string) {
    savingId.value = id;
    store.setError(null);
    try {
      const expectedVersion = store.getGoalById(id)?.version;
      if (expectedVersion === undefined) return false;
      const receipt = await executeGoalOperation(
        () => service.deleteGoal(id, { expectedVersion }),
        {
          ...opOpts,
          fallbackKey: 'goal.error.deleteFailed',
          scope: 'deleteGoal',
        },
      );
      if (receipt) {
        store.applyGoalMutationReceipt(receipt);
        store.removeGoal(id);
        return true;
      }
      return false;
    } finally {
      savingId.value = null;
    }
  }

  // ── Goal lifecycle ───────────────────────────────────────────────────

  async function applyLifecycleMutation(
    id: string,
    mutate: (expectedVersion: number) => ReturnType<typeof service.planGoal>,
    fallbackKey: string,
    scope: string,
  ) {
    savingId.value = id;
    store.setError(null);
    try {
      const expectedVersion = store.getGoalById(id)?.version;
      if (expectedVersion === undefined) return false;
      const receipt = await executeGoalOperation(() => mutate(expectedVersion), {
        ...opOpts,
        fallbackKey,
        scope,
      });
      if (!receipt) return false;
      store.applyGoalMutationReceipt(receipt);
      return true;
    } finally {
      savingId.value = null;
    }
  }

  async function planGoal(id: string) {
    return applyLifecycleMutation(
      id,
      (expectedVersion) => service.planGoal(id, expectedVersion),
      'goal.error.planFailed',
      'planGoal',
    );
  }

  async function activateGoal(id: string) {
    return applyLifecycleMutation(
      id,
      (expectedVersion) => service.activateGoal(id, expectedVersion),
      'goal.error.activateFailed',
      'activateGoal',
    );
  }

  async function completeGoal(id: string) {
    return applyLifecycleMutation(
      id,
      (expectedVersion) => service.completeGoal(id, expectedVersion),
      'goal.error.completeFailed',
      'completeGoal',
    );
  }

  async function abandonGoal(id: string) {
    return applyLifecycleMutation(
      id,
      (expectedVersion) => service.abandonGoal(id, expectedVersion),
      'goal.error.abandonFailed',
      'abandonGoal',
    );
  }

  // ── Aggregate View ───────────────────────────────────────────────────

  async function getGoalAggregateView(goalId: string): Promise<GetGoalAggregateRes | null> {
    store.setLoading(true);
    store.setError(null);
    try {
      const data = await executeGoalOperation(() => service.getGoalAggregateView(goalId), {
        ...opOpts,
        fallbackKey: 'goal.error.loadAggregateViewFailed',
        scope: 'getGoalAggregateView',
      });
      if (data) {
        store.upsertGoal(data.goal);
        store.selectGoal(goalId);
        store.setKeyResults(goalId, data.keyResults, data.goal.version);
        store.setGoalRecords(data.records);
        store.setGoalReviews(data.reviews);
        return data;
      }
      return null;
    } finally {
      store.setLoading(false);
    }
  }

  // ── Sub-composables ──────────────────────────────────────────────────

  const filters = useGoalFilters(fetchGoals);
  const keyResultOps = useKeyResults();
  const recordOps = useGoalRecords();

  return {
    // View state
    goals,
    selectedGoal,
    getKeyResultById: store.getKeyResultById,
    keyResults,
    goalReviews,
    goalRecords,
    isLoading,
    isSaving,
    error,
    // Goal CRUD
    fetchGoals,
    createGoal,
    updateGoal,
    deleteGoal,
    planGoal,
    activateGoal,
    completeGoal,
    abandonGoal,
    // Aggregate view
    getGoalAggregateView,
    // Filters (delegated)
    ...filters,
    // Key Result CRUD (delegated)
    ...keyResultOps,
    // Records + Reviews (delegated)
    ...recordOps,
  };
}
