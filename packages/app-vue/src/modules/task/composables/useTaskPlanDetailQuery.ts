/**
 * useTaskPlanDetailQuery — Task template detail query (detail view).
 *
 * detail 用 detail(id) key；相同 key 的并发 consumer 共享一次 request。无 id（或 'new'）
 * 时 query 不启用，`currentTemplate` 为 null。
 */

import { computed, type MaybeRefOrGetter, toValue } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useI18n } from 'vue-i18n';
import { unwrap } from '@memoflow/contracts/result';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { TASK_SERVICE_KEY } from '../../../di/keys';
import { useServerStateIdentityScope } from '../../../platform/server-state';
import { taskPlanQueryKeys } from '../../../platform/server-state/query-keys';
import { TASK_TEMPLATE_STALE_TIME_MS } from '../../../platform/server-state/query-policy';
import { translateResultError } from '../../../shared/utils/translate-result-error';

/**
 * Create the identity-scoped Task template detail query for a (reactive) id.
 * 为（响应式）id 创建 identity-scoped 任务模板详情查询。
 */
export function useTaskPlanDetailQuery(id: MaybeRefOrGetter<string | undefined | null>) {
  const service = useStrictInject(TASK_SERVICE_KEY, 'TaskService');
  const resolveIdentityScope = useServerStateIdentityScope();
  const { t } = useI18n();

  const query = useQuery(() => {
    const templateId = toValue(id);
    const enabled = !!templateId && templateId !== 'new';
    return {
      queryKey: taskPlanQueryKeys.detail(resolveIdentityScope(), templateId ?? ''),
      queryFn: async () => {
        const result = await service.getTemplate(templateId as string);
        const dto = unwrap(result);
        return dto.toDTO() as TaskPlanClientDTO;
      },
      enabled,
      staleTime: TASK_TEMPLATE_STALE_TIME_MS,
    };
  });

  const currentTemplate = computed<TaskPlanClientDTO | null>(() => query.data.value ?? null);
  const isLoading = computed(() => query.isPending.value);
  const isError = computed(() => query.isError.value);
  const error = computed(() =>
    query.error.value
      ? translateResultError(query.error.value, t, {
          fallbackKey: 'task.error.loadTemplatesFailed',
        })
      : null,
  );

  return {
    query,
    currentTemplate,
    isLoading,
    isError,
    error,
    refetch: query.refetch,
  };
}
