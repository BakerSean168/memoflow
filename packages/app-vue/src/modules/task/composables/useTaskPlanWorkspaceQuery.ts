import { computed, type MaybeRefOrGetter, toValue } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import type { GetTaskWorkspaceReq } from '@memoflow/contracts/task';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { TASK_SERVICE_KEY } from '../../../di/keys';
import { useServerStateIdentityScope } from '../../../platform/server-state';
import { taskPlanQueryKeys } from '../../../platform/server-state/query-keys';

export function useTaskPlanWorkspaceQuery(id: MaybeRefOrGetter<string | undefined | null>, request?: GetTaskWorkspaceReq) {
  const service = useStrictInject(TASK_SERVICE_KEY, 'TaskService');
  const identityScope = useServerStateIdentityScope();
  const query = useQuery(() => {
    const planId = toValue(id);
    return {
      queryKey: taskPlanQueryKeys.workspace(identityScope(), planId ?? '', Number(request?.recentLimit ?? 5)),
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
