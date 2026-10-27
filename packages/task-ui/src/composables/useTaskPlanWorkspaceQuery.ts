import { computed, type MaybeRefOrGetter, toValue } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import type { GetTaskWorkspaceReq } from '@memoflow/task-workspace-contracts';
import { taskUiHost } from '../task-ui-host';

export function useTaskPlanWorkspaceQuery(
  id: MaybeRefOrGetter<string | undefined | null>,
  request?: GetTaskWorkspaceReq,
) {
  const service = taskUiHost.useStrictInject(taskUiHost.TASK_SERVICE_KEY, 'TaskService');
  const identityScope = taskUiHost.useServerStateIdentityScope();
  const query = useQuery(() => {
    const planId = toValue(id);
    return {
      queryKey: taskUiHost.taskPlanQueryKeys.workspace(
        identityScope(),
        planId ?? '',
        Number(request?.recentLimit ?? 5),
      ),
      enabled: !!planId && planId !== 'new',
      queryFn: async () => {
        const result = await service.getWorkspace(planId as string, request);
        if (!result.ok) throw result.error;
        return result.data;
      },
    };
  });
  return { query, workspace: computed(() => query.data.value ?? null), refetch: query.refetch };
}
