import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { GoalHomeProgressSummary } from '@memoflow/contracts/goal';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { createComposableHandleError } from '../../../shared/utils/create-composable-handle-error';
import { useStrictInject } from '../../../shared/utils/useStrictInject';

const emptySummary: GoalHomeProgressSummary = {
  activeCount: 0,
  goals: [],
};

/** Goal-owned Home progress read model. No cross-domain aggregate or cache truth. */
export function useGoalHomeSummary() {
  const service = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
  const { t } = useI18n();
  const summary = ref<GoalHomeProgressSummary>({ ...emptySummary });
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const handleError = createComposableHandleError({
    t,
    setError: (message) => {
      error.value = message;
    },
  });

  async function refresh() {
    isLoading.value = true;
    error.value = null;
    try {
      const result = await service.getHomeSummary();
      if (result.ok) {
        summary.value = result.data;
      } else {
        handleError(result.error, 'goal.error.loadFailed');
      }
    } catch (cause) {
      handleError(cause, 'goal.error.loadFailed');
    } finally {
      isLoading.value = false;
    }
  }

  return {
    summary,
    goals: computed(() => summary.value.goals),
    activeCount: computed(() => summary.value.activeCount),
    isLoading,
    error,
    refresh,
  };
}
