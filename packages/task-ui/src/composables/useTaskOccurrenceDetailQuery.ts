import { computed, type MaybeRefOrGetter, toValue } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';
import { unwrap } from '@memoflow/contracts/result';
import { translateResultErrorMessage as translateResultError } from '@memoflow/http-client';
import { TASK_OCCURRENCE_STALE_TIME_MS, TASK_SERVICE_KEY, taskOccurrenceQueryKeys, useServerStateIdentityScope, useStrictInject } from '../task-ui-host.ts';

/** Task owns the occurrence read; mutations patch this same identity-scoped cache. */
export function useTaskOccurrenceDetailQuery(id: MaybeRefOrGetter<string>) {
  const service = useStrictInject(TASK_SERVICE_KEY, 'TaskService');
  const resolveIdentityScope = useServerStateIdentityScope();
  const { t } = useI18n();
  const query = useQuery(() => {
    const occurrenceId = toValue(id);
    return {
      queryKey: taskOccurrenceQueryKeys.detail(resolveIdentityScope(), occurrenceId),
      queryFn: async () => unwrap(await service.getOccurrence(occurrenceId)),
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
