import { computed, type MaybeRefOrGetter, toValue } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';
import { unwrap } from '@memoflow/contracts/result';
import { TASK_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { useServerStateIdentityScope } from '../../../platform/server-state';
import { taskOccurrenceQueryKeys } from '../../../platform/server-state/query-keys';
import { TASK_OCCURRENCE_STALE_TIME_MS } from '../../../platform/server-state/query-policy';
import { translateResultError } from '../../../shared/utils/translate-result-error';

/** Task owns the occurrence read; mutations patch this same identity-scoped cache. */
export function useTaskOccurrenceDetailQuery(id: MaybeRefOrGetter<string>) {
  const service = useStrictInject(TASK_SERVICE_KEY, 'TaskService');
  const resolveIdentityScope = useServerStateIdentityScope();
  const { t } = useI18n();
  const query = useQuery(() => {
    const occurrenceId = toValue(id);
    return {
      queryKey: taskOccurrenceQueryKeys.detail(resolveIdentityScope(), occurrenceId),
      queryFn: async () => unwrap(await service.getOccurrence(occurrenceId)).toDTO(),
      enabled: !!occurrenceId,
      staleTime: TASK_OCCURRENCE_STALE_TIME_MS,
    };
  });
  return {
    query,
    occurrence: computed(() => query.data.value ?? null),
    isLoading: computed(() => query.isLoading.value),
    error: computed(() =>
      query.error.value
        ? translateResultError(query.error.value, t, {
            fallbackKey: 'task.error.loadInstancesFailed',
          })
        : null,
    ),
    refetch: query.refetch,
  };
}
