import { computed, onScopeDispose, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import { unwrap } from '@memoflow/contracts/result';
import { TASK_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { startOfDayMs, endOfDayMs } from '../../../shared/utils/product-time';
import { useServerStateIdentityScope, useServerStateRuntime } from '../../../platform/server-state';
import { taskPlanQueryKeys } from '../../../platform/server-state/query-keys';
import { TASK_TEMPLATE_STALE_TIME_MS } from '../../../platform/server-state/query-policy';
import { isTaskOccurrenceOnTodaySurface } from '../utils/task-occurrence-presentation';
import { useTaskStore } from '../stores/task-store';
import { useTaskOccurrences } from './useTaskOccurrences';

/** Canonical Today owner projection shared by Management, Home and Capsule. */
export function useTaskToday() {
  const store = useTaskStore();
  const { t } = useI18n();
  const operations = useTaskOccurrences();
  const resolveIdentityScope = useServerStateIdentityScope();
  const runtime = useServerStateRuntime();
  const taskService = useStrictInject(TASK_SERVICE_KEY, 'TaskService');
  const templates = ref<TaskPlanClientDTO[]>([]);
  const detailsLoading = ref(false);
  const detailsError = ref(false);
  let requestGeneration = 0;

  watch(resolveIdentityScope, () => {
    ++requestGeneration;
    templates.value = [];
    detailsLoading.value = false;
    detailsError.value = false;
  });
  onScopeDispose(() => {
    ++requestGeneration;
  });
  async function load(force = false) {
    const request = ++requestGeneration;
    const identityScope = resolveIdentityScope();
    detailsLoading.value = true;
    detailsError.value = false;
    try {
      const now = Date.now();
      const occurrences = await operations.fetchInstancesByDateRange(
        startOfDayMs(now),
        endOfDayMs(now),
        {
          force,
          includeOverdueOpen: true,
        },
      );
      if (request !== requestGeneration || identityScope !== resolveIdentityScope()) return;
      const missingPlanIds = [
        ...new Set(occurrences.map((occurrence) => String(occurrence.planId))),
      ];
      // Read each referenced plan through its canonical identity-scoped detail key.
      const details = await Promise.all(
        missingPlanIds.map((planId) =>
          runtime.queryClient.fetchQuery({
            queryKey: taskPlanQueryKeys.detail(identityScope, planId),
            staleTime: force ? 0 : TASK_TEMPLATE_STALE_TIME_MS,
            queryFn: async () => unwrap(await taskService.getPlan(planId)).toDTO(),
          }),
        ),
      );
      if (request !== requestGeneration || identityScope !== resolveIdentityScope()) return;
      templates.value = details;
    } catch {
      if (request === requestGeneration && identityScope === resolveIdentityScope())
        detailsError.value = true;
    } finally {
      if (request === requestGeneration && identityScope === resolveIdentityScope())
        detailsLoading.value = false;
    }
  }

  return {
    operations,
    resolveIdentityScope,
    templates,
    instances: computed(() =>
      store.instances.filter((occurrence) => isTaskOccurrenceOnTodaySurface(occurrence)),
    ),
    detailsLoading,
    detailsError,
    isLoading: computed(() => store.isLoading || detailsLoading.value),
    error: computed(
      () => store.error ?? (detailsError.value ? t('task.error.loadTemplatesFailed') : null),
    ),
    load,
  };
}
