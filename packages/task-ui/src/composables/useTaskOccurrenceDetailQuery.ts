import { computed, type MaybeRefOrGetter, toValue } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';
import { unwrap } from '@memoflow/contracts/result';
import { translateResultErrorMessage as translateResultError } from '@memoflow/http-client';
import { taskUiHost } from '../task-ui-host';

/** Task owns the occurrence read; mutations patch this same identity-scoped cache. */
export function useTaskOccurrenceDetailQuery(id: MaybeRefOrGetter<string>) {
  const service = taskUiHost.useStrictInject(taskUiHost.TASK_SERVICE_KEY, 'TaskService');
  const resolveIdentityScope = taskUiHost.useServerStateIdentityScope();
  const { t } = useI18n();
  const query = useQuery(() => {
    const occurrenceId = toValue(id);
    return {
      queryKey: taskUiHost.taskOccurrenceQueryKeys.detail(resolveIdentityScope(), occurrenceId),
      queryFn: async () => unwrap(await service.getOccurrence(occurrenceId)),
      enabled: !!occurrenceId,
      staleTime: taskUiHost.TASK_OCCURRENCE_STALE_TIME_MS,
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
