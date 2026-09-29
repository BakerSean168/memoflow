import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { GoalHomeProgressSummary } from '@memoflow/contracts/goal';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { createComposableHandleError } from '../../../shared/utils/create-composable-handle-error';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { useServerStateIdentityScope, useServerStateRuntime } from '../../../platform/server-state';
import { goalHomeQueryKeys } from '../../../platform/server-state/query-keys';
import { GOAL_HOME_STALE_TIME_MS } from '../../../platform/server-state/query-policy';

const emptySummary: GoalHomeProgressSummary = {
  activeCount: 0,
  goals: [],
};

/** Goal-owned Home progress read model. No cross-domain aggregate or cache truth. */
export function useGoalHomeSummary() {
  const service = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
  const runtime = useServerStateRuntime();
  const resolveIdentityScope = useServerStateIdentityScope();
  const { t } = useI18n();
  const queryKey = goalHomeQueryKeys.summary(resolveIdentityScope());
  const summary = ref<GoalHomeProgressSummary>(
    runtime.queryClient.getQueryData<GoalHomeProgressSummary>(queryKey) ?? { ...emptySummary },
  );
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const handleError = createComposableHandleError({
    t,
    setError: (message) => {
      error.value = message;
    },
  });

  async function load(force: boolean) {
    isLoading.value =
      runtime.queryClient.getQueryData<GoalHomeProgressSummary>(queryKey) === undefined;
    error.value = null;
    try {
      summary.value = await runtime.queryClient.fetchQuery<GoalHomeProgressSummary>({
        queryKey,
        staleTime: force ? 0 : GOAL_HOME_STALE_TIME_MS,
        queryFn: async () => {
          const result = await service.getHomeSummary();
          if (!result.ok) throw result.error;
          return result.data;
        },
      });
    } catch (cause) {
      handleError(cause, 'goal.error.loadFailed');
    } finally {
      isLoading.value = false;
    }
  }

  /** Cache-aware read for lightweight shell surfaces. */
  function ensure() {
    return load(false);
  }

  /** Explicit owner refresh for active pages/reconciliation/retry. */
  function refresh() {
    return load(true);
  }

  return {
    summary,
    goals: computed(() => summary.value.goals),
    activeCount: computed(() => summary.value.activeCount),
    isLoading,
    error,
    ensure,
    refresh,
  };
}
